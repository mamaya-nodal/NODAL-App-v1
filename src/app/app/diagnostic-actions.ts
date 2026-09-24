"use server";

import { createHash } from "node:crypto";
import { calculateAccountResult, type AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { AccountStateOrigin } from "@/modules/operations/domain/account-state";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { buildOperationalSummary, type FundingWithdrawal, type WalletMovement } from "@/modules/summary/domain/operational-summary";
import type { SummaryAlert } from "@/modules/summary/domain/summary-alerts";
import { findAllocationComparisons, shouldEscalateToTerra, verifiedStatus, type DiagnosticAnswer, type DiagnosticFacts } from "@/modules/diagnostics/domain/diagnostic-rules";
import { askDiagnosticModel } from "@/modules/diagnostics/server/openai-diagnostic";
import { createClient } from "@/lib/supabase/server";

export type DiagnosticChatResult = Readonly<{
  answer?: DiagnosticAnswer;
  cached?: boolean;
  message: string;
  model?: "gpt-5.6-luna" | "gpt-5.6-terra";
  ok: boolean;
  usedAdvancedAnalysis?: boolean;
}>;

const alertCodes: SummaryAlert["code"][] = ["capital_reconciliation_difference", "gain_reconciliation_difference", "missing_broker_balance", "pending_funding_withdrawal", "manual_account_state"];
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function validAnswer(value: unknown): value is DiagnosticAnswer {
  return Boolean(value && typeof value === "object" && "status" in value && "summary" in value && "evidence" in value && Array.isArray(value.evidence));
}

export async function investigateAlert(input: Readonly<{
  alertCode: string;
  history: ReadonlyArray<Readonly<{ role: "assistant" | "user"; content: string }>>;
  periodId: string;
  question: string;
}>): Promise<DiagnosticChatResult> {
  const question = input.question.trim().slice(0, 600);
  const history = input.history.slice(-4).map((item) => ({ role: item.role, content: item.content.trim().slice(0, 900) })).filter((item) => item.content);
  if (!uuid(input.periodId) || !alertCodes.includes(input.alertCode as SummaryAlert["code"]) || question.length < 3) return { ok: false, message: "Escribí una pregunta breve sobre esta alerta." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { data: period } = await supabase.from("periods").select("id, period_month").eq("id", input.periodId).maybeSingle();
  if (!period) return { ok: false, message: "No tenés acceso a este período." };

  const [companiesResult, accountsResult, purchasesResult, controlsResult, participantsResult, entriesResult, phaseWithdrawalsResult, walletResult, fundingResult, activityResult] = await Promise.all([
    supabase.from("companies").select("id, display_name"),
    supabase.from("accounts").select("id, company_id, reference_number, state, state_origin").eq("period_id", input.periodId),
    supabase.from("purchases").select("account_id, price_cents, funds_origin").eq("period_id", input.periodId),
    supabase.from("daily_controls").select("id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, phase, transfer_fee_cents").eq("period_id", input.periodId).order("control_number"),
    supabase.from("daily_control_participants").select("daily_control_id, account_id, allocated_result_cents").eq("period_id", input.periodId),
    supabase.from("operation_entries").select("id, daily_control_id, account_id, operated_on, phase, participant_role, destination, magnitude_cents").eq("period_id", input.periodId),
    supabase.from("account_phase_withdrawals").select("account_id, phase, total_withdrawal_cents").eq("period_id", input.periodId),
    supabase.from("wallet_movements").select("id, wallet_id, destination_wallet_id, occurred_on, kind, amount_cents, fee_cents, observation").eq("period_id", input.periodId),
    supabase.from("funding_withdrawals").select("id, account_id, approved_on, amount_cents, collected_on, wallet_id, collection_fee_cents").eq("period_id", input.periodId).eq("is_active", true),
    supabase.rpc("list_nodal_period_activity", { target_period_id: input.periodId }),
  ]);
  if ([accountsResult, purchasesResult, controlsResult, participantsResult, entriesResult, phaseWithdrawalsResult, walletResult, fundingResult].some((result) => result.error)) return { ok: false, message: "No se pudo reconstruir el expediente de esta alerta." };

  const companies = new Map((companiesResult.data ?? []).map((company) => [company.id, company.display_name]));
  const purchases = new Map((purchasesResult.data ?? []).map((purchase) => [purchase.account_id, purchase]));
  const labels = new Map((accountsResult.data ?? []).map((account) => [account.id, `${companies.get(account.company_id) ?? "Empresa"} · Cuenta ${account.reference_number}`]));
  const entries: OperationRegisterEntry[] = (entriesResult.data ?? []).map((entry) => ({
    accountId: entry.account_id, accountReference: 0, companyId: "", companyName: "", dailyControlId: entry.daily_control_id,
    destination: entry.destination, id: entry.id, magnitudeInCents: Number(entry.magnitude_cents), operatedOn: entry.operated_on,
    participantRole: entry.participant_role, phase: entry.phase,
  }));
  const phaseWithdrawals: AccountPhaseWithdrawal[] = (phaseWithdrawalsResult.data ?? []).flatMap((withdrawal) => withdrawal.phase === "Evaluacion" ? [] : [{ accountId: withdrawal.account_id, phase: withdrawal.phase as AccountPhaseWithdrawal["phase"], totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents) }]);
  const walletMovements: WalletMovement[] = (walletResult.data ?? []).map((movement) => ({ id: movement.id, occurredOn: movement.occurred_on, kind: movement.kind as WalletMovement["kind"], amountInCents: Number(movement.amount_cents), destinationWalletId: movement.destination_wallet_id, feeInCents: Number(movement.fee_cents ?? 0), observation: movement.observation, walletId: movement.wallet_id }));
  const fundingWithdrawals: FundingWithdrawal[] = (fundingResult.data ?? []).map((withdrawal) => ({ id: withdrawal.id, accountId: withdrawal.account_id, approvedOn: withdrawal.approved_on, collectedOn: withdrawal.collected_on, amountInCents: Number(withdrawal.amount_cents), feeInCents: Number(withdrawal.collection_fee_cents ?? 0), walletId: withdrawal.wallet_id }));
  const operationalSummary = buildOperationalSummary({
    accounts: (accountsResult.data ?? []).map((account) => { const purchase = purchases.get(account.id); return { id: account.id, state: account.state, stateOrigin: account.state_origin as AccountStateOrigin, priceInCents: Number(purchase?.price_cents ?? 0), fundsOrigin: purchase?.funds_origin === "Saldo generado" ? "Saldo generado" : "Aporte trader" }; }),
    controls: (controlsResult.data ?? []).map((control) => ({ balanceAfterInCents: Number(control.balance_after_cents), controlNumber: control.control_number, kind: control.kind, movementInCents: control.movement_cents === null ? null : Number(control.movement_cents), operatingResultInCents: control.operating_result_cents === null ? null : Number(control.operating_result_cents), originDestination: control.origin_destination, transferFeeInCents: Number(control.transfer_fee_cents ?? 0) })),
    entries, fundingWithdrawals, phaseWithdrawals, walletMovements,
  });
  const alertCode = input.alertCode as SummaryAlert["code"];
  const alertDifferenceInCents = alertCode === "capital_reconciliation_difference" ? operationalSummary.positionDifferenceInCents
    : alertCode === "gain_reconciliation_difference" ? operationalSummary.realizedReconciliationDifferenceInCents
    : alertCode === "pending_funding_withdrawal" ? operationalSummary.fundingPendingInCents
    : alertCode === "manual_account_state" ? operationalSummary.manualAccountStateCount : 0;
  const allocationComparisons = findAllocationComparisons({
    controls: (controlsResult.data ?? []).map((control) => ({ id: control.id, number: control.control_number, operatedOn: control.operated_on, phase: control.phase })),
    entries: (entriesResult.data ?? []).map((entry) => ({ accountId: entry.account_id, controlId: entry.daily_control_id, destination: entry.destination, magnitudeInCents: Number(entry.magnitude_cents) })),
    labelsByAccountId: labels,
    participants: (participantsResult.data ?? []).map((participant) => ({ accountId: participant.account_id, allocatedInCents: Number(participant.allocated_result_cents), controlId: participant.daily_control_id })),
  });
  const accountPhases = (accountsResult.data ?? []).flatMap((account) => calculateAccountResult(entries.filter((entry) => entry.accountId === account.id), phaseWithdrawals.filter((withdrawal) => withdrawal.accountId === account.id), account.state_origin as AccountStateOrigin, Number(purchases.get(account.id)?.price_cents ?? 0)).phaseResults.filter((phase) => phase.broker.entryCount > 0 || phase.totalWithdrawalInCents > 0).map((phase) => ({ accountLabel: labels.get(account.id) ?? "Cuenta", phase: phase.phase, positiveInCents: phase.broker.positiveInCents, negativeInCents: phase.broker.negativeInCents, withdrawalInCents: phase.totalWithdrawalInCents, totalGainInCents: phase.totalGainInCents })));
  const facts: DiagnosticFacts = {
    accountPhases, alertCode, alertDifferenceInCents, allocationComparisons,
    exactDifferenceMatches: alertCode === "gain_reconciliation_difference" ? allocationComparisons.filter((comparison) => Math.abs(comparison.differenceInCents) === Math.abs(alertDifferenceInCents) && alertDifferenceInCents !== 0) : [],
    recentActivity: ((activityResult.data ?? []) as Array<Record<string, unknown>>).slice(0, 20).map((row) => ({ action: typeof row.action === "string" ? row.action : null, account: typeof row.company_name === "string" && typeof row.account_reference === "number" ? `${row.company_name} ${row.account_reference}` : null, amountInCents: typeof row.primary_amount_cents === "number" || typeof row.primary_amount_cents === "string" ? Number(row.primary_amount_cents) : null, date: typeof row.operated_on === "string" ? row.operated_on : null, reason: typeof row.reason === "string" ? row.reason : null })),
    summaryValues: { brokerBalanceInCents: operationalSummary.brokerBalanceInCents, capitalNetInCents: operationalSummary.capitalNetInCents, fundingPendingInCents: operationalSummary.fundingPendingInCents, periodResultInCents: operationalSummary.periodResultInCents, positionDifferenceInCents: operationalSummary.positionDifferenceInCents, positionExpectedInCents: operationalSummary.positionExpectedInCents, positionObservableInCents: operationalSummary.positionObservableInCents, realizedGainInCents: operationalSummary.realizedGainInCents, realizedReconciliationDifferenceInCents: operationalSummary.realizedReconciliationDifferenceInCents, floatingInCents: operationalSummary.floatingInCents, virginPriceInCents: operationalSummary.virginPriceInCents, walletBalanceInCents: operationalSummary.walletBalanceInCents },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ facts, history, question })).digest("hex");
  const { data: cached } = await supabase.from("ai_diagnostics").select("answer, final_model, escalated").eq("period_id", input.periodId).eq("context_fingerprint", fingerprint).maybeSingle();
  if (cached && validAnswer(cached.answer)) return { answer: cached.answer, cached: true, message: "Diagnóstico recuperado sin consumir una nueva consulta.", model: cached.final_model, ok: true, usedAdvancedAnalysis: cached.escalated };

  let luna;
  try { luna = await askDiagnosticModel({ facts, history, model: "gpt-5.6-luna", question, safetyUserId: user.id }); }
  catch (error) { return { ok: false, message: error instanceof Error && error.message === "OPENAI_NOT_CONFIGURED" ? "El asistente está preparado, pero todavía falta configurar la clave privada de OpenAI." : "El asistente no pudo completar el análisis. No se modificó ningún dato." }; }
  let final = luna; let finalModel: "gpt-5.6-luna" | "gpt-5.6-terra" = "gpt-5.6-luna"; let escalated = false;
  if (shouldEscalateToTerra({ answer: luna.answer, facts })) {
    try { final = await askDiagnosticModel({ facts, history: [...history, { role: "assistant", content: JSON.stringify(luna.answer) }], model: "gpt-5.6-terra", question: `Revisá el diagnóstico inicial y resolvé las dudas restantes. ${question}`, safetyUserId: user.id }); finalModel = "gpt-5.6-terra"; escalated = true; }
    catch { final = luna; }
  }
  const answer = { ...final.answer, status: verifiedStatus(final.answer, facts) };
  await supabase.rpc("save_nodal_ai_diagnostic", { target_alert_code: alertCode, target_answer: answer, target_context_fingerprint: fingerprint, target_escalated: escalated, target_final_model: finalModel, target_input_tokens: luna.inputTokens + (finalModel === "gpt-5.6-terra" ? final.inputTokens : 0), target_output_tokens: luna.outputTokens + (finalModel === "gpt-5.6-terra" ? final.outputTokens : 0), target_period_id: input.periodId, target_question: question });
  return { answer, cached: false, message: "Análisis terminado. La IA no modificó ningún registro.", model: finalModel, ok: true, usedAdvancedAnalysis: escalated };
}
