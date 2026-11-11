import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRepairAction, repairActions } from "../domain/repair-actions";
import { incidentKinds, incidentRequirements, type IncidentKind } from "../domain/repair-workflow";
import { createServiceClient } from "@/lib/supabase/service";
import { repairSummary, repairChanges } from "../domain/repair-summary";

export type RepairPreview = { planId: string; label: string; details?: string[]; parameters: Record<string, string | number | boolean | string[]> };
function rows(value: unknown, key: string): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) ? candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function cents(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Converts the private, user-scoped repair snapshot into evidence the model can reason about. */
export function buildInvestigationContext(raw: unknown, question: string) {
  const companies = new Map(rows(raw, "companies").map((item) => [item.id, item.display_name]));
  const identities = new Map(rows(raw, "identities").map((item) => [item.id, [item.first_name, item.last_name].filter(Boolean).join(" ")]));
  const assignments = new Map(rows(raw, "assignments").map((item) => [item.account_id, item.identity_id]));
  const accounts = rows(raw, "accounts").map((account) => {
    const links = Array.isArray(account.links) ? account.links.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
    const latestLink = links.at(-1) ?? null;
    const identityId = assignments.get(account.id);
    return {
      company: companies.get(account.company_id) ?? null,
      id: account.id,
      identity: identities.get(identityId) ?? null,
      link: latestLink,
      period_id: account.period_id,
      reference: account.reference_number,
      state: account.state,
    };
  });
  const brokerTransfers = rows(raw, "brokerEvents").map((event) => {
    const sourceAccounts = Array.isArray(event.source_accounts) ? event.source_accounts : [];
    const first = sourceAccounts[0] && typeof sourceAccounts[0] === "object" && !Array.isArray(sourceAccounts[0]) ? sourceAccounts[0] as Record<string, unknown> : {};
    const expected = cents(first.expectedBalanceInCents);
    const observed = cents(event.balance_cents);
    const difference = expected === null || observed === null ? null : observed - expected;
    return {
      amount_cents: difference === null ? null : Math.abs(difference),
      detected_direction: difference === null || difference === 0 ? "unknown" : difference > 0 ? "wallet_to_broker" : "broker_to_wallet",
      event_id: event.id,
      expected_balance_cents: expected,
      observed_at: event.observed_at,
      observed_balance_cents: observed,
      source_event_id: event.source_event_id,
      status: event.status,
    };
  });
  return {
    accounts,
    availableRepairs: Object.fromEntries(Object.entries(repairActions).map(([name, action]) => [name, { label: action.label, required: action.required }])),
    brokerTransfers,
    connectors: rows(raw, "connectors"),
    controls: rows(raw, "controls"),
    incomplete: Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && (raw as Record<string, unknown>).incomplete),
    inventories: rows(raw, "inventories"),
    openings: rows(raw, "openings"),
    operations: rows(raw, "operations"),
    payouts: rows(raw, "payouts"),
    periods: rows(raw, "periods"),
    purchases: rows(raw, "purchases"),
    question,
    wallets: rows(raw, "wallets"),
  };
}

export async function readRepairContext(db: SupabaseClient, question = "") {
  const result = await db.rpc("get_nodalito_repair_context");
  if (result.error || !result.data) throw new Error("No pude leer los registros autorizados para esta investigación.");
  return buildInvestigationContext(result.data, question);
}

export async function prepareRepair(db: SupabaseClient, input: unknown): Promise<RepairPreview> {
  const draft = parseRepairAction(input);
  const result = await db.rpc("prepare_nodalito_repair", { target_period_id: draft.periodId, target_action: draft.action, target_parameters: draft.parameters });
  if (result.error || typeof result.data !== "string") throw new Error("No pude preparar la corrección. Necesita revisión y no se modificó ningún dato.");
  const preview = await db.rpc("get_nodalito_repair", { target_plan_id: result.data });
  if (preview.error || preview.data?.status !== "ready" || !Array.isArray(preview.data?.simulation)) {
    throw new Error("No pude validar esta corrección. No cambié registros contables.");
  }
  const details = [...repairSummary(draft.parameters), ...repairChanges(preview.data.simulation)];
  const accountIds = Array.isArray(draft.parameters.account_ids) ? draft.parameters.account_ids : typeof draft.parameters.account_id === "string" ? [draft.parameters.account_id] : [];
  if (accountIds.length) {
    const names = preview.data.accountNames;
    if (!Array.isArray(names) || names.length !== accountIds.length) throw new Error("No pude identificar todas las cuentas de la corrección.");
    details.unshift(`Cuentas: ${names.join(", ")}`);
  }
  if (typeof draft.parameters.wallet_id === "string" && draft.parameters.wallet_id) {
    if (typeof preview.data.walletName !== "string") throw new Error("No pude identificar la billetera.");
    details.unshift(`Billetera: ${preview.data.walletName}`);
  }
  details.push("Al confirmar, la modificación se aplicará y quedará notificada al equipo de NODAL.");
  return { planId: result.data, label: repairActions[draft.action].label, parameters: draft.parameters, details };
}

export async function openRepairIncident(ownerId: string, question: string, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("incident_invalid");
  const body = input as Record<string, unknown>;
  if (!incidentKinds.includes(body.kind as IncidentKind) || typeof body.description !== "string" || !body.description.trim()) throw new Error("incident_invalid");
  const kind = body.kind as IncidentKind;
  const db = createServiceClient();
  const { data: existing, error: lookupError } = await db.from("nodal_agent_cases").select("id").eq("subject_user_id", ownerId).eq("category", `incident:${kind}`).eq("source_question", question).in("status", ["open", "investigating"]).limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return { caseId: existing[0].id, state: "needs_review", message: "La investigación ya está en la bandeja privada de Admin Master." };
  const { data, error } = await db.from("nodal_agent_cases").insert({
    reporter_user_id: ownerId, subject_user_id: ownerId, status: "open", priority: "normal",
    category: `incident:${kind}`, title: question.slice(0, 160), description: body.description.slice(0, 4000),
    source_question: question.slice(0, 1000), evidence: { kind, requirements: incidentRequirements[kind], source: "trader_report", verified: false },
  }).select("id").single();
  if (error || !data) throw new Error("incident_save_failed");
  return { caseId: data.id, state: "needs_review", message: "La investigación quedó registrada en la bandeja privada de Admin Master. Todavía no se modificó la contabilidad." };
}

export async function openEscalationCase(
  ownerId: string,
  question: string,
  escalation: Readonly<{ kind: "human_help" | "suspected_manipulation"; priority: "critical" | "normal"; reason: string }>,
) {
  const db = createServiceClient();
  const category = escalation.kind === "human_help" ? "human_help" : "risk:manipulation";
  const sourceQuestion = question.slice(0, 1000);
  const { data: existing, error: lookupError } = await db.from("nodal_agent_cases")
    .select("id")
    .eq("subject_user_id", ownerId)
    .eq("category", category)
    .eq("source_question", sourceQuestion)
    .in("status", ["open", "investigating"])
    .limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return existing[0].id as string;
  const { data, error } = await db.from("nodal_agent_cases").insert({
    reporter_user_id: ownerId,
    subject_user_id: ownerId,
    status: "open",
    priority: escalation.priority,
    category,
    title: escalation.kind === "human_help" ? "Solicitud de asistencia de NODAL" : "Solicitud contable sensible",
    description: escalation.reason,
    source_question: sourceQuestion,
    evidence: { source: "nodalito", verified: false, escalationKind: escalation.kind },
  }).select("id").single();
  if (error || !data) throw new Error("escalation_save_failed");
  return data.id as string;
}
