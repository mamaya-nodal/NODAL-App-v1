import { createClient } from "@supabase/supabase-js";

import { roundLikeSheets } from "@/modules/control-diario/domain/result-allocation";
import { correlateAutomaticOperationBatches, countBrokerContextProps } from "../domain/automatic-operation-batch";
import { projectAutomaticAccounting, type AutomaticAccountingMember } from "../domain/automatic-accounting-projection";
import { classifyNinjaAccount } from "../domain/account-classification";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";
import { recordNinjaBrokerOperationBalance } from "./broker-balance-processing";

type AccountingPhase = AutomaticAccountingMember["phase"];

function dateInBuenosAires(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires", year: "numeric",
  }).format(new Date(value));
}

function accountingPhase(detectedPhase: "Evaluation" | "Funded" | "Live" | null, latestPhase: AccountingPhase): AccountingPhase {
  if (detectedPhase === "Evaluation") return "Evaluacion";
  return latestPhase && latestPhase !== "Evaluacion" ? latestPhase : null;
}

export async function persistAutomaticOperationBatches(connectorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { persistedBatches: 0 };
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: sessions, error: sessionsError }, { data: links, error: linksError }, { data: inventory }] = await Promise.all([
    supabase.from("ninja_operation_probe_sessions").select("id,connection_name,account_name,opening_event_id,opened_at,flat_at,last_event_at,settled_at,status,opening_balance,closing_balance,minimum_net_liquidation,minimum_net_liquidation_at,result,execution_count,instruments,direction,quantity").eq("connector_id", connectorId).is("excluded_at", null).order("opened_at").order("id"),
    supabase.from("ninja_account_links").select("account_id,connection_name,external_account_name,first_seen_at,closed_at").eq("connector_id", connectorId),
    supabase.from("ninja_inventory_snapshots").select("accounts,observed_at").eq("connector_id", connectorId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sessionsError || linksError || !sessions?.length) return { persistedBatches: 0 };

  const inventoryClassifications = new Map<string, ReturnType<typeof classifyNinjaAccount>>();
  for (const account of (inventory?.accounts ?? []) as NinjaAccountSnapshot[]) {
    inventoryClassifications.set(
      `${account.connectionName}\u0000${account.accountName}`,
      classifyNinjaAccount(account, inventory?.observed_at ?? new Date().toISOString()),
    );
  }

  const linkForSession = (session: (typeof sessions)[number]) => (links ?? [])
    .filter((link) =>
      link.connection_name === session.connection_name &&
      link.external_account_name === session.account_name &&
      link.first_seen_at <= session.opened_at &&
      (link.closed_at === null || link.closed_at >= session.opened_at),
    )
    .sort((left, right) => right.first_seen_at.localeCompare(left.first_seen_at))[0] ?? null;

  const classified = sessions.flatMap((session) => {
    const key = `${session.connection_name}\u0000${session.account_name}`;
    const link = linkForSession(session);
    const accountId = link?.account_id ?? null;
    const detected = inventoryClassifications.get(key) ?? classifyNinjaAccount({
      accountName: session.account_name,
      cashValue: null,
      connectionName: session.connection_name,
      connectionStatus: "Connected",
      netLiquidation: null,
      providerName: "NinjaTrader",
      realizedProfitLoss: null,
      totalCashBalance: null,
      unrealizedProfitLoss: null,
    }, session.opened_at);
    if (!accountId && detected.type !== "broker" && detected.type !== "prop") return [];
    return [{
      accountId,
      accountName: session.account_name,
      closingBalance: session.closing_balance === null ? null : Number(session.closing_balance),
      connectionName: session.connection_name,
      direction: session.direction as "Long" | "Short" | null,
      executionCount: session.execution_count,
      flatAt: session.flat_at,
      instruments: session.instruments,
      lastEventAt: session.last_event_at,
      minimumNetLiquidation: session.minimum_net_liquidation === null ? null : Number(session.minimum_net_liquidation),
      minimumNetLiquidationAt: session.minimum_net_liquidation_at,
      openedAt: session.opened_at,
      openingBalance: session.opening_balance === null ? null : Number(session.opening_balance),
      openingEventId: Number(session.opening_event_id),
      quantity: session.quantity,
      result: session.result === null ? null : Number(session.result),
      role: accountId || detected.type === "prop" ? "prop" as const : "broker" as const,
      settledAt: session.settled_at,
      status: session.status as "closed" | "open" | "settling",
    }];
  });
  const batches = correlateAutomaticOperationBatches(classified)
    .sort((left, right) => left.broker.openedAt.localeCompare(right.broker.openedAt));
  const accountIds = [...new Set(classified.flatMap((operation) => operation.accountId ? [operation.accountId] : []))];
  const [{ data: accountRows }, { data: entryRows }] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id,period_id,company_id").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase.from("operation_entries").select("account_id,phase,operated_on,created_at").in("account_id", accountIds).order("operated_on", { ascending: false }).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const accountsById = new Map((accountRows ?? []).map((account) => [account.id, account]));
  const latestPhaseByAccountId = new Map<string, AccountingPhase>();
  for (const entry of entryRows ?? []) {
    if (!latestPhaseByAccountId.has(entry.account_id)) latestPhaseByAccountId.set(entry.account_id, entry.phase as AccountingPhase);
  }
  const expectedBalanceByPeriod = new Map<string, number | null>();
  const loadExpectedBalance = async (periodId: string, openedAt: string) => {
    if (expectedBalanceByPeriod.has(periodId)) return expectedBalanceByPeriod.get(periodId) ?? null;
    const [{ data: currentControl }, { data: excludedSession }] = await Promise.all([
      supabase.from("daily_controls")
        .select("balance_after_cents,created_at,received_balance_cents,sync_issue_reason")
        .eq("period_id", periodId)
        .lte("created_at", openedAt)
        .order("control_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("ninja_operation_probe_sessions")
        .select("closing_balance,settled_at")
        .eq("connector_id", connectorId)
        .not("excluded_at", "is", null)
        .not("closing_balance", "is", null)
        .not("settled_at", "is", null)
        .lte("settled_at", openedAt)
        .order("settled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (excludedSession && (!currentControl || Date.parse(excludedSession.settled_at) > Date.parse(currentControl.created_at))) {
      const value = roundLikeSheets(Number(excludedSession.closing_balance) * 100);
      expectedBalanceByPeriod.set(periodId, value);
      return value;
    }
    if (currentControl) {
      const value = currentControl.sync_issue_reason && currentControl.received_balance_cents !== null
        ? Number(currentControl.received_balance_cents)
        : Number(currentControl.balance_after_cents);
      expectedBalanceByPeriod.set(periodId, value);
      return value;
    }
    const { data: currentPeriod } = await supabase.from("periods").select("workspace_id,period_month").eq("id", periodId).maybeSingle();
    if (!currentPeriod) {
      expectedBalanceByPeriod.set(periodId, null);
      return null;
    }
    const { data: priorPeriods } = await supabase.from("periods").select("id")
      .eq("workspace_id", currentPeriod.workspace_id)
      .lt("period_month", currentPeriod.period_month)
      .order("period_month", { ascending: false });
    for (const prior of priorPeriods ?? []) {
      const { data: priorControl } = await supabase.from("daily_controls").select("balance_after_cents,received_balance_cents,sync_issue_reason")
        .eq("period_id", prior.id).order("control_number", { ascending: false }).limit(1).maybeSingle();
      if (priorControl) {
        const value = priorControl.sync_issue_reason && priorControl.received_balance_cents !== null
          ? Number(priorControl.received_balance_cents)
          : Number(priorControl.balance_after_cents);
        expectedBalanceByPeriod.set(periodId, value);
        return value;
      }
    }
    const { data: automaticBaseline } = await supabase
      .from("ninja_broker_balance_events")
      .select("balance_cents")
      .eq("connector_id", connectorId)
      .lte("observed_at", openedAt)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (automaticBaseline) {
      const value = Number(automaticBaseline.balance_cents);
      expectedBalanceByPeriod.set(periodId, value);
      return value;
    }
    expectedBalanceByPeriod.set(periodId, null);
    return null;
  };
  let persistedBatches = 0;
  for (const batch of batches) {
    const brokerSession = sessions.find((session) => Number(session.opening_event_id) === batch.broker.openingEventId);
    if (!brokerSession) continue;
    const { data: existingCommitted } = await supabase
      .from("ninja_operation_batches")
      .select("accounting_period_id,accounting_status,daily_control_id")
      .eq("connector_id", connectorId)
      .eq("broker_session_id", brokerSession.id)
      .maybeSingle();
    if (existingCommitted?.accounting_status === "committed" && existingCommitted.daily_control_id) {
      persistedBatches += 1;
      if (existingCommitted.accounting_period_id && batch.broker.closingBalance !== null) {
        expectedBalanceByPeriod.set(
          existingCommitted.accounting_period_id,
          roundLikeSheets(batch.broker.closingBalance * 100),
        );
      }
      continue;
    }
    const projectionMembers = batch.props.flatMap((prop): AutomaticAccountingMember[] => {
      if (!prop.accountId) return [];
      const account = accountsById.get(prop.accountId);
      const session = sessions.find((candidate) => Number(candidate.opening_event_id) === prop.openingEventId);
      if (!account || !session) return [];
      const key = `${session.connection_name}\u0000${session.account_name}`;
      const detectedPhase = inventoryClassifications.get(key)?.phase
        ?? classifyNinjaAccount({
          accountName: session.account_name,
          cashValue: null,
          connectionName: session.connection_name,
          connectionStatus: "Connected",
          netLiquidation: null,
          providerName: "NinjaTrader",
          realizedProfitLoss: null,
          totalCashBalance: null,
          unrealizedProfitLoss: null,
        }, session.opened_at).phase;
      return [{
        accountId: prop.accountId,
        allocatedBrokerResultInCents: prop.allocatedBrokerResultInCents,
        companyId: account.company_id,
        periodId: account.period_id,
        phase: accountingPhase(detectedPhase, latestPhaseByAccountId.get(prop.accountId) ?? null),
      }];
    });
    const uniquePeriod = new Set(projectionMembers.map((member) => member.periodId));
    const projectionPeriodId = uniquePeriod.size === 1 ? projectionMembers[0]?.periodId ?? null : null;
    const expectedOpeningBalanceInCents = projectionPeriodId
      ? await loadExpectedBalance(projectionPeriodId, batch.broker.openedAt)
      : null;
    const brokerOpeningBalanceInCents = batch.broker.openingBalance === null ? null : roundLikeSheets(batch.broker.openingBalance * 100);
    const brokerClosingBalanceInCents = batch.broker.closingBalance === null ? null : roundLikeSheets(batch.broker.closingBalance * 100);
    const projection = projectAutomaticAccounting({
      batchStatus: batch.status,
      brokerClosingBalanceInCents,
      brokerOpeningBalanceInCents,
      brokerResultInCents: batch.brokerResultInCents,
      expectedOpeningBalanceInCents,
      members: projectionMembers,
      technicalMemberCount: batch.props.length,
    });
    const { data: stored, error } = await supabase.rpc("upsert_nodal_deduplicated_operation_batch", {
      target_accounting_blocking_reason: projection.reason,
      target_accounting_company_id: projection.companyId,
      target_accounting_period_id: projection.periodId,
      target_accounting_phase: projection.phase,
      target_accounting_status: projection.status,
      target_broker_result_cents: batch.brokerResultInCents,
      target_broker_session_id: brokerSession.id,
      target_connector_id: connectorId,
      target_context_prop_count: countBrokerContextProps(classified, batch.broker),
      target_distributed_cents: batch.distributedInCents,
      target_opened_at: batch.broker.openedAt,
      target_operated_on: dateInBuenosAires(batch.broker.settledAt ?? batch.broker.openedAt),
      target_proposed_prop_count: batch.props.length,
      target_rounding_difference_cents: batch.roundingDifferenceInCents,
      target_settled_at: batch.broker.settledAt,
      target_status: batch.status,
    }).single();
    const storedBatch = stored as { accepted?: boolean; batch_id?: string } | null;
    if (error || !storedBatch?.accepted || !storedBatch.batch_id) continue;
    const storedBatchId = storedBatch.batch_id;
    if (batch.broker.closingBalance !== null) {
      await recordNinjaBrokerOperationBalance({
        accountName: batch.broker.accountName,
        balance: batch.broker.closingBalance,
        connectionName: batch.broker.connectionName,
        connectorId,
        observedAt: batch.broker.lastEventAt,
        openingEventId: batch.broker.openingEventId,
      });
    }
    await supabase.from("ninja_operation_batch_members").delete().eq("batch_id", storedBatchId);
    const members = [{
      account_id: null,
      allocated_broker_result_cents: null,
      batch_id: storedBatchId,
      role: "broker",
      session_id: brokerSession.id,
    }, ...batch.props.flatMap((prop) => {
      const session = sessions.find((candidate) => Number(candidate.opening_event_id) === prop.openingEventId);
      return session ? [{
        account_id: prop.accountId,
        allocated_broker_result_cents: prop.allocatedBrokerResultInCents,
        batch_id: storedBatchId,
        role: "prop",
        session_id: session.id,
      }] : [];
    })];
    const { error: memberError } = await supabase.from("ninja_operation_batch_members").insert(members);
    if (!memberError) {
      persistedBatches += 1;
      if (projection.status === "shadow_ready" && projection.periodId && brokerClosingBalanceInCents !== null) {
        const { error: commitError } = await supabase.rpc("commit_ninja_automatic_operation_batch", {
          target_batch_id: storedBatchId,
        });
        if (!commitError) {
          expectedBalanceByPeriod.set(projection.periodId, brokerClosingBalanceInCents);
        } else {
          await supabase.from("ninja_operation_batches").update({
            accounting_blocking_reason: "El cierre quedó conciliado, pero no pudo registrarse automáticamente.",
          }).eq("id", storedBatchId);
        }
      }
    }
  }
  return { persistedBatches };
}
