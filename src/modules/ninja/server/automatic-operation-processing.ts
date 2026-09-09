import { createClient } from "@supabase/supabase-js";

import { correlateAutomaticOperationBatches } from "../domain/automatic-operation-batch";
import { classifyNinjaAccount } from "../domain/account-classification";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";

export async function persistAutomaticOperationBatches(connectorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { persistedBatches: 0 };
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: sessions, error: sessionsError }, { data: links, error: linksError }, { data: inventory }] = await Promise.all([
    supabase.from("ninja_operation_probe_sessions").select("id,connection_name,account_name,opening_event_id,opened_at,flat_at,last_event_at,settled_at,status,opening_balance,closing_balance,result,execution_count,instruments,direction,quantity").eq("connector_id", connectorId),
    supabase.from("ninja_account_links").select("account_id,connection_name,external_account_name").eq("connector_id", connectorId).is("closed_at", null),
    supabase.from("ninja_inventory_snapshots").select("accounts,observed_at").eq("connector_id", connectorId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sessionsError || linksError || !sessions?.length) return { persistedBatches: 0 };

  const linkedAccounts = new Map((links ?? []).map((link) => [
    `${link.connection_name}\u0000${link.external_account_name}`,
    link.account_id,
  ]));
  const inventoryTypes = new Map<string, "broker" | "prop" | "simulator" | "unknown">();
  for (const account of (inventory?.accounts ?? []) as NinjaAccountSnapshot[]) {
    inventoryTypes.set(
      `${account.connectionName}\u0000${account.accountName}`,
      classifyNinjaAccount(account, inventory?.observed_at ?? new Date().toISOString()).type,
    );
  }

  const classified = sessions.flatMap((session) => {
    const key = `${session.connection_name}\u0000${session.account_name}`;
    const accountId = linkedAccounts.get(key) ?? null;
    const observedType = inventoryTypes.get(key);
    if (!accountId && observedType !== "broker") return [];
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
      openedAt: session.opened_at,
      openingBalance: session.opening_balance === null ? null : Number(session.opening_balance),
      openingEventId: Number(session.opening_event_id),
      quantity: session.quantity,
      result: session.result === null ? null : Number(session.result),
      role: accountId ? "prop" as const : "broker" as const,
      settledAt: session.settled_at,
      status: session.status as "closed" | "open" | "settling",
    }];
  });
  const batches = correlateAutomaticOperationBatches(classified);
  let persistedBatches = 0;
  for (const batch of batches) {
    const brokerSession = sessions.find((session) => Number(session.opening_event_id) === batch.broker.openingEventId);
    if (!brokerSession) continue;
    const { data: stored, error } = await supabase.from("ninja_operation_batches").upsert({
      broker_result_cents: batch.brokerResultInCents,
      broker_session_id: brokerSession.id,
      connector_id: connectorId,
      distributed_cents: batch.distributedInCents,
      opened_at: batch.broker.openedAt,
      rounding_difference_cents: batch.roundingDifferenceInCents,
      settled_at: batch.broker.settledAt,
      status: batch.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "connector_id,broker_session_id" }).select("id").single();
    if (error || !stored) continue;
    await supabase.from("ninja_operation_batch_members").delete().eq("batch_id", stored.id);
    const members = [{
      account_id: null,
      allocated_broker_result_cents: null,
      batch_id: stored.id,
      role: "broker",
      session_id: brokerSession.id,
    }, ...batch.props.flatMap((prop) => {
      const session = sessions.find((candidate) => Number(candidate.opening_event_id) === prop.openingEventId);
      return session ? [{
        account_id: prop.accountId,
        allocated_broker_result_cents: prop.allocatedBrokerResultInCents,
        batch_id: stored.id,
        role: "prop",
        session_id: session.id,
      }] : [];
    })];
    const { error: memberError } = await supabase.from("ninja_operation_batch_members").insert(members);
    if (!memberError) persistedBatches += 1;
  }
  return { persistedBatches };
}
