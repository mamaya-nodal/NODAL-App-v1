import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NodalitoFinding } from "../domain/deterministic-audit";
import { findPhaseTransitionDiagnostics } from "../domain/phase-transition-diagnostic";
import { connectorVersionState } from "@/modules/ninja/domain/connector-version";
import { createServiceClient } from "@/lib/supabase/service";

/** Read-only inspection shared by the conversation and future scheduled rounds. */
export async function runAccountingDiagnostic(db: SupabaseClient): Promise<NodalitoFinding[]> {
  const { data: claims, error: authError } = await db.auth.getClaims();
  if (authError || !claims?.claims.sub) throw new Error("accounting_diagnostic_unauthenticated");
  const service = createServiceClient();
  const user = await service.from("nodal_users").select("access_state").eq("id", claims.claims.sub).single();
  if (user.error || user.data?.access_state !== "active") throw new Error("accounting_diagnostic_forbidden");
  return runAccountingDiagnosticForOwner(service, claims.claims.sub);
}

/** Internal scheduled-audit entry. The caller must derive ownerId from the pilot allowlist. */
export async function runAccountingDiagnosticForOwner(db: SupabaseClient, ownerId: string): Promise<NodalitoFinding[]> {
  const { data: spaces, error: spacesError } = await db.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("modality", "real");
  if (spacesError) throw spacesError;
  if (!spaces?.length) return [];
  const { data: periods, error: periodsError } = await db.from("periods").select("id,period_month").in("workspace_id", spaces.map((space) => space.id)).eq("lifecycle_status", "open");
  if (periodsError) throw periodsError;
  if (!periods?.length) return [];
  const periodIds = periods.map((period) => period.id);
  const earliestOpenPeriod = periods.map((period) => period.period_month).sort()[0];
  const responses = await Promise.all([
    db.from("accounts").select("id,state,reference_number").in("period_id", periodIds).limit(1001),
    db.from("purchases").select("id,account_id,funds_origin,wallet_id").in("period_id", periodIds).limit(1001),
    db.from("operation_entries").select("id,account_id,daily_control_id").in("period_id", periodIds).limit(1001),
    db.from("funding_withdrawals").select("id,account_id,approved_on,collected_on,wallet_id,amount_cents").in("period_id", periodIds).eq("is_active", true).limit(1001),
  ]);
  for (const result of responses) if (result.error) throw result.error;
  if (responses.some((result) => (result.data?.length ?? 0) > 1000)) throw new Error("accounting_diagnostic_incomplete");
  const [accountsResult, purchasesResult, entriesResult, payoutsResult] = responses;
  const accounts = accountsResult.data ?? [];
  const entries = entriesResult.data ?? [];
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
  const connectors = await db.from("ninja_connectors").select("id,connector_version,last_seen_at").eq("owner_user_id", ownerId).eq("status", "active").limit(101);
  if (connectors.error) throw connectors.error;
  if ((connectors.data?.length ?? 0) > 100) throw new Error("accounting_diagnostic_incomplete");
  for (const connector of connectors.data ?? []) {
    if (connectorVersionState({ runningVersion: connector.connector_version, installedSourceVersion: null }) === "update_available") findings.push({ ...base, category: "connector", id: `connector-version:${connector.id}`, severity: "attention", title: "Conector con versión anterior", detail: "El conector no está ejecutando la versión vigente. Verificá su actualización y reinicio.", evidence: `Conector ${connector.id}; versión ${connector.connector_version}; última señal ${connector.last_seen_at ?? "sin señal"}.` });
  }
  if (connectors.data?.length) {
    const connectorIds = connectors.data.map((connector) => connector.id);
    const batches = await db.from("ninja_operation_batches")
      .select("id,connector_id,broker_session_id,status,accounting_status,accounting_blocking_reason,opened_at")
      .in("connector_id", connectorIds).gte("opened_at", `${earliestOpenPeriod}T00:00:00.000Z`).eq("accounting_status", "blocked").limit(1001);
    if (batches.error) throw batches.error;
    if ((batches.data?.length ?? 0) > 1000) throw new Error("accounting_diagnostic_incomplete");
    for (const batch of batches.data ?? []) findings.push({ ...base, category: "reconciliation", id: `unreconciled:${batch.id}`, severity: "attention", title: "Operación detectada sin conciliar", detail: batch.accounting_blocking_reason || "La operación tiene un bloqueo contable que requiere revisión.", evidence: `Lote ${batch.id}; apertura ${batch.opened_at}.` });

    const coverageGaps = (batches.data ?? []).filter((batch) =>
      batch.status === "unmatched" && batch.accounting_blocking_reason === "Cobertura sin cuentas prop compatibles",
    );
    if (coverageGaps.length) {
      const oldest = coverageGaps.reduce((current, batch) => current < batch.opened_at ? current : batch.opened_at, coverageGaps[0].opened_at);
      const [sessions, links] = await Promise.all([
        db.from("ninja_operation_probe_sessions")
          .select("id,connector_id,connection_name,account_name,opened_at")
          .in("connector_id", connectorIds).eq("status", "closed").is("excluded_at", null)
          .gte("opened_at", new Date(Date.parse(oldest) - 2 * 60 * 1000).toISOString()).limit(5001),
        db.from("ninja_account_links")
          .select("account_id,connector_id,connection_name,external_account_name,first_seen_at,closed_at,closure_reason")
          .in("connector_id", connectorIds).not("closed_at", "is", null).eq("closure_reason", "phase_transition").limit(5001),
      ]);
      if (sessions.error || links.error) throw sessions.error ?? links.error;
      if ((sessions.data?.length ?? 0) > 5000 || (links.data?.length ?? 0) > 5000) throw new Error("accounting_diagnostic_incomplete");
      for (const diagnostic of findPhaseTransitionDiagnostics(
        coverageGaps.map((batch) => ({
          id: batch.id,
          connectorId: batch.connector_id,
          brokerSessionId: Number(batch.broker_session_id),
          openedAt: batch.opened_at,
        })),
        (sessions.data ?? []).map((session) => ({
          id: Number(session.id), connectorId: session.connector_id, connectionName: session.connection_name,
          accountName: session.account_name, openedAt: session.opened_at,
        })),
        (links.data ?? []).map((link) => ({
          accountId: link.account_id, connectorId: link.connector_id, connectionName: link.connection_name,
          externalAccountName: link.external_account_name, firstSeenAt: link.first_seen_at,
          closedAt: link.closed_at, closureReason: link.closure_reason,
        })),
      )) {
        findings.push({
          ...base,
          category: "reconciliation",
          id: `phase-transition:${diagnostic.batchId}`,
          severity: "critical",
          title: "Cambio de fase posterior dejó una cobertura sin asignar",
          detail: `Se detectaron ${diagnostic.accountIds.length} cuentas que operaron antes de pasar de evaluación a funded. La cobertura requiere reparación cronológica; no se asigna automáticamente.`,
          evidence: `Lote ${diagnostic.batchId}; sesiones ${diagnostic.sessionIds.join(", ")}; cuentas ${diagnostic.accountIds.join(", ")}.`,
        });
      }
    }
  }
  return findings;
}
