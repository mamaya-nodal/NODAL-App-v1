import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodalitoFinding } from "../domain/deterministic-audit";
import {
  diagnoseBalanceChains,
  diagnoseClosedAccountLinks,
  diagnoseCommittedBatchCoverage,
  diagnoseControlLedgers,
  diagnoseOperationalBaselines,
  diagnosePendingBrokerEvents,
  diagnoseUnbatchedLinkedSessions,
  diagnoseUnreconciledBatches,
} from "../domain/accounting-diagnostic";
import { connectorVersionState } from "@/modules/ninja/domain/connector-version";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_ROWS = 3000;
// La ronda diaria busca fallas nuevas. Historia antigua ya corregida a mano no
// debe reaparecer como una operación omitida sólo porque no conserva lote técnico.
const RECENT_OPERATION_DAYS = 7;

export type AccountingDiagnosticOptions = Readonly<{
  now?: Date;
  recentOperationDays?: number;
}>;

function assertComplete(results: readonly Readonly<{ data: unknown[] | null; error: unknown }>[]) {
  for (const result of results) if (result.error) throw result.error;
  if (results.some((result) => (result.data?.length ?? 0) >= MAX_ROWS)) throw new Error("accounting_diagnostic_incomplete");
}

/** Read-only inspection shared by the conversation and scheduled Admin Master rounds. */
export async function runAccountingDiagnostic(db: SupabaseClient): Promise<NodalitoFinding[]> {
  const { data: claims, error: authError } = await db.auth.getClaims();
  if (authError || !claims?.claims.sub) throw new Error("accounting_diagnostic_unauthenticated");
  const service = createServiceClient();
  const user = await service.from("nodal_users").select("access_state").eq("id", claims.claims.sub).single();
  if (user.error || user.data?.access_state !== "active") throw new Error("accounting_diagnostic_forbidden");
  return runAccountingDiagnosticForOwner(service, claims.claims.sub);
}

/** Internal read-only audit. ownerId must come from an active NODAL user. */
export async function runAccountingDiagnosticForOwner(
  db: SupabaseClient,
  ownerId: string,
  options: AccountingDiagnosticOptions = {},
): Promise<NodalitoFinding[]> {
  const owner = await db.from("nodal_users").select("id").eq("id", ownerId).eq("access_state", "active").maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data) throw new Error("accounting_diagnostic_owner_inactive");

  const { data: spaces, error: spacesError } = await db.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("modality", "real");
  if (spacesError) throw spacesError;
  if (!spaces?.length) return [];
  const { data: periods, error: periodsError } = await db.from("periods").select("id").in("workspace_id", spaces.map((space) => space.id)).eq("lifecycle_status", "open");
  if (periodsError) throw periodsError;
  const periodIds = (periods ?? []).map((period) => period.id);

  const accountsResult = await db.from("accounts").select("id,state,reference_number").in("workspace_id", spaces.map((space) => space.id)).limit(MAX_ROWS);
  if (accountsResult.error) throw accountsResult.error;
  if ((accountsResult.data?.length ?? 0) >= MAX_ROWS) throw new Error("accounting_diagnostic_incomplete");
  const accounts = accountsResult.data ?? [];
  const accountIds = accounts.map((account) => account.id);
  const responses = await Promise.all([
    accountIds.length ? db.from("purchases").select("id,account_id,funds_origin,wallet_id").in("account_id", accountIds).limit(MAX_ROWS) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("operation_entries").select("id,account_id,daily_control_id,destination,magnitude_cents").in("account_id", accountIds).limit(MAX_ROWS) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("funding_withdrawals").select("id,account_id,approved_on,collected_on,wallet_id,amount_cents").in("account_id", accountIds).eq("is_active", true).limit(MAX_ROWS) : Promise.resolve({ data: [], error: null }),
    periodIds.length ? db.from("daily_controls").select("id,period_id,control_number,balance_before_cents,balance_after_cents,operating_result_cents").in("period_id", periodIds).limit(MAX_ROWS) : Promise.resolve({ data: [], error: null }),
    periodIds.length ? db.from("daily_control_participants").select("daily_control_id,account_id,allocated_result_cents").in("period_id", periodIds).limit(MAX_ROWS) : Promise.resolve({ data: [], error: null }),
  ]);
  assertComplete(responses);
  const [purchasesResult, entriesResult, payoutsResult, controlsResult, participantsResult] = responses;
  const entries = entriesResult.data ?? [];
  const controls = controlsResult.data ?? [];
  const participants = participantsResult.data ?? [];
  const findings: NodalitoFinding[] = [];
  const base = { userId: null, userName: null };

  for (const account of accounts) {
    const count = entries.filter((entry) => entry.account_id === account.id).length;
    if (account.state === "virgin" && count > 0) findings.push({ ...base, category: "activity", id: `account-state:${account.id}`, severity: "attention", title: "Cuenta con actividad mostrada como virgen", detail: `La cuenta ${account.reference_number} tiene ${count} asientos operativos. Hay que verificar su estado y punto de partida.`, evidence: `Cuenta ${account.id}; ${count} asientos del período abierto.` });
  }
  for (const purchase of purchasesResult.data ?? []) {
    if (purchase.funds_origin === "Saldo generado" && !purchase.wallet_id) findings.push({ ...base, category: "billing", id: `purchase-origin:${purchase.id}`, severity: "attention", title: "Compra sin billetera de origen", detail: "La compra figura pagada con saldo generado, pero no tiene una billetera asociada. Confirmá el origen real antes de corregirla.", evidence: `Compra ${purchase.id}; cuenta ${purchase.account_id}.` });
  }
  for (const payout of payoutsResult.data ?? []) {
    if (payout.collected_on && !payout.wallet_id) findings.push({ ...base, category: "payout", id: `payout-wallet:${payout.id}`, severity: "critical", title: "Payout cobrado sin destino registrado", detail: "Hay un cobro sin billetera de destino. Debe verificarse antes de registrarlo nuevamente.", evidence: `Payout ${payout.id}; cobro ${payout.collected_on}.` });
    else if (!payout.collected_on) findings.push({ ...base, category: "payout", id: `payout-pending:${payout.id}`, severity: "info", title: "Payout pendiente de cobro", detail: "Está aprobado y todavía no figura cobrado. Esto no demuestra un error: confirmá si el dinero ya se acreditó.", evidence: `Payout ${payout.id}; aprobado ${payout.approved_on}; ${(payout.amount_cents / 100).toFixed(2)} USD.` });
  }

  findings.push(...diagnoseBalanceChains(controls));
  findings.push(...diagnoseControlLedgers(controls, participants, entries));

  const accountStateById = new Map(accounts.map((account) => [account.id, account.state]));
  const links = accountIds.length ? await db.from("ninja_account_links")
    .select("account_id,connector_id,connection_name,external_account_name,phase,accounting_phase,completed_trade_days,closed_at")
    .in("account_id", accountIds).is("closed_at", null).limit(MAX_ROWS) : { data: [], error: null };
  if (links.error) throw links.error;
  if ((links.data?.length ?? 0) >= MAX_ROWS) throw new Error("accounting_diagnostic_incomplete");
  const activeLinks = (links.data ?? []).filter((link) => accountStateById.get(link.account_id) !== "closed");
  findings.push(...diagnoseOperationalBaselines(activeLinks));
  findings.push(...diagnoseClosedAccountLinks((links.data ?? []).map((link) => ({
    account_id: link.account_id,
    account_state: accountStateById.get(link.account_id) ?? "unknown",
    closed_at: link.closed_at,
    external_account_name: link.external_account_name,
  }))));

  const connectors = await db.from("ninja_connectors").select("id,connector_version,last_seen_at").eq("owner_user_id", ownerId).eq("status", "active").limit(201);
  if (connectors.error) throw connectors.error;
  if ((connectors.data?.length ?? 0) >= 201) throw new Error("accounting_diagnostic_incomplete");
  for (const connector of connectors.data ?? []) {
    if (connectorVersionState({ runningVersion: connector.connector_version, installedSourceVersion: null }) === "update_available") findings.push({ ...base, category: "connector", id: `connector-version:${connector.id}`, severity: "attention", title: "Conector con versión anterior", detail: "El conector no está ejecutando la versión vigente. Verificá su actualización y reinicio.", evidence: `Conector ${connector.id}; versión ${connector.connector_version}; última señal ${connector.last_seen_at ?? "sin señal"}.` });
  }

  const connectorIds = (connectors.data ?? []).map((connector) => connector.id);
  if (connectorIds.length) {
    const now = options.now ?? new Date();
    const recentOperationDays = Math.max(1, options.recentOperationDays ?? RECENT_OPERATION_DAYS);
    const cutoff = new Date(now.getTime() - recentOperationDays * 86_400_000).toISOString();
    const [batches, sessions, pendingBrokerEvents] = await Promise.all([
      db.from("ninja_operation_batches").select("id,broker_session_id,status,accounting_status,accounting_blocking_reason,accounting_period_id,daily_control_id,opened_at")
        .in("connector_id", connectorIds).gte("opened_at", cutoff).limit(MAX_ROWS),
      db.from("ninja_operation_probe_sessions").select("id,connector_id,connection_name,account_name,opened_at,settled_at,status,execution_count")
        .in("connector_id", connectorIds).eq("status", "closed").is("excluded_at", null).gte("opened_at", cutoff).limit(MAX_ROWS),
      db.from("ninja_broker_balance_events").select("id,connector_id,observed_at")
        .in("connector_id", connectorIds).eq("status", "pending").limit(MAX_ROWS),
    ]);
    assertComplete([batches, sessions, pendingBrokerEvents]);
    // La falta de período es parte de la anomalía. Nunca debe ocultar el lote
    // de la auditoría que intenta explicar por qué no terminó la contabilidad.
    const relevantBatches = (batches.data ?? []).filter((batch) =>
      !batch.accounting_period_id || periodIds.includes(batch.accounting_period_id));
    const batchIds = relevantBatches.map((batch) => batch.id);
    const members = batchIds.length ? await db.from("ninja_operation_batch_members").select("batch_id,session_id,account_id,role").in("batch_id", batchIds).limit(MAX_ROWS) : { data: [], error: null };
    if (members.error) throw members.error;
    if ((members.data?.length ?? 0) >= MAX_ROWS) throw new Error("accounting_diagnostic_incomplete");

    const committed = relevantBatches.filter((batch) => batch.accounting_status === "committed" && batch.accounting_period_id && periodIds.includes(batch.accounting_period_id));
    findings.push(...diagnoseCommittedBatchCoverage(committed, members.data ?? [], entries));

    findings.push(...diagnoseUnreconciledBatches(relevantBatches, now));
    findings.push(...diagnosePendingBrokerEvents(pendingBrokerEvents.data ?? [], now));

    const activeLinkKeys = new Set(activeLinks.map((link) => `${link.connector_id}\u0000${link.connection_name}\u0000${link.external_account_name}`.toUpperCase()));
    const linkedSessions = (sessions.data ?? []).filter((session) => activeLinkKeys.has(`${session.connector_id}\u0000${session.connection_name}\u0000${session.account_name}`.toUpperCase())
      && session.settled_at && now.getTime() - new Date(session.settled_at).getTime() >= 15 * 60_000);
    const linkedSessionIds = new Set<number>([
      ...relevantBatches.map((batch) => Number(batch.broker_session_id)),
      ...(members.data ?? []).map((member) => Number(member.session_id)),
    ]);
    findings.push(...diagnoseUnbatchedLinkedSessions(linkedSessions, linkedSessionIds));
  }
  return findings;
}
