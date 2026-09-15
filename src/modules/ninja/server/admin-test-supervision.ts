import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminNinjaTestSupervision,
  NinjaSupervisionBatch,
  NinjaSupervisionConnection,
  NinjaSupervisionLink,
  NinjaSupervisionSession,
} from "../domain/admin-test-supervision";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";

function currentMonthInBuenosAires() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires", year: "numeric",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-01`;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service configuration is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function assertAdmin(caller: SupabaseClient) {
  const { data: { user } } = await caller.auth.getUser();
  if (!user) throw new Error("Not authorized");
  const { data: profile } = await caller.from("nodal_users").select("access_role,access_state").eq("id", user.id).maybeSingle();
  if (profile?.access_state !== "active" || profile.access_role !== "admin") throw new Error("Not authorized");
}

type InventoryAccount = NinjaAccountSnapshot & { firstSeenAt?: string };

export async function loadAdminNinjaTestSupervision(
  caller: SupabaseClient,
  userId: string,
): Promise<AdminNinjaTestSupervision | null> {
  await assertAdmin(caller);
  const service = serviceClient();
  const { data: targetUser } = await service.from("nodal_users").select("id,email,display_name,access_state").eq("id", userId).maybeSingle();
  if (!targetUser) return null;

  const [{ data: workspaces }, { data: connector }] = await Promise.all([
    service.from("workspaces").select("id,modality,periods(id,period_month)").eq("owner_user_id", userId),
    service.from("ninja_connectors").select("id,status,connector_version,paired_at,last_seen_at").eq("owner_user_id", userId).eq("status", "active").order("paired_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const realWorkspace = (workspaces ?? []).find((workspace) => workspace.modality === "real");
  const period = realWorkspace?.periods.find((candidate) => candidate.period_month === currentMonthInBuenosAires()) ?? null;

  if (!connector) {
    return {
      batches: [], connections: [], connector: null,
      currentPeriod: period ? { id: period.id, month: period.period_month } : null,
      inventory: { accounts: [], observedAt: null }, links: [], sessions: [],
      user: { accessState: targetUser.access_state, email: targetUser.email, id: targetUser.id, name: targetUser.display_name },
    } as AdminNinjaTestSupervision;
  }

  const [inventoryResult, reviewsResult, linksResult, sessionsResult, batchesResult] = await Promise.all([
    service.from("ninja_inventory_snapshots").select("accounts,observed_at").eq("connector_id", connector.id).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("ninja_connector_connection_reviews").select("connection_name,status").eq("connector_id", connector.id),
    service.from("ninja_account_links").select("account_id,connection_name,external_account_name,first_seen_at,closed_at").eq("connector_id", connector.id),
    service.from("ninja_operation_probe_sessions").select("id,connection_name,account_name,opened_at,flat_at,settled_at,status,opening_balance,closing_balance,result,execution_count,instruments,direction,quantity").eq("connector_id", connector.id).is("excluded_at", null).order("opened_at", { ascending: false }).order("id", { ascending: false }).limit(30),
    service.from("ninja_operation_batches").select("id,broker_session_id,status,broker_result_cents,distributed_cents,rounding_difference_cents,opened_at,settled_at,accounting_mode,accounting_status,accounting_blocking_reason,accounting_company_id,accounting_phase,operated_on").eq("connector_id", connector.id).order("opened_at", { ascending: false }).limit(30),
  ]);

  const inventory = inventoryResult.data;
  const accounts = (inventory?.accounts ?? []) as InventoryAccount[];
  const reviewByName = new Map((reviewsResult.data ?? []).map((review) => [review.connection_name, review.status]));
  const accountCountByConnection = new Map<string, number>();
  for (const account of accounts) accountCountByConnection.set(account.connectionName, (accountCountByConnection.get(account.connectionName) ?? 0) + 1);
  const connections: NinjaSupervisionConnection[] = [...accountCountByConnection.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, accountCount]) => ({ accountCount, name, status: (reviewByName.get(name) as NinjaSupervisionConnection["status"]) ?? null }));

  const linkRows = linksResult.data ?? [];
  const linkAccountIds = linkRows.map((link) => link.account_id);
  const { data: linkedAccounts } = linkAccountIds.length > 0
    ? await service.from("accounts").select("id,state,periods(period_month),companies(display_name)").in("id", linkAccountIds)
    : { data: [] };
  const linkedById = new Map((linkedAccounts ?? []).map((account) => [account.id, account]));
  const links: NinjaSupervisionLink[] = linkRows.flatMap((link) => {
    const account = linkedById.get(link.account_id);
    if (!account) return [];
    const company = Array.isArray(account.companies) ? account.companies[0] : account.companies;
    const accountPeriod = Array.isArray(account.periods) ? account.periods[0] : account.periods;
    return [{
      accountId: link.account_id, accountName: link.external_account_name,
      company: company?.display_name ?? "Sin empresa", connectionName: link.connection_name,
      firstSeenAt: link.first_seen_at, periodMonth: accountPeriod?.period_month ?? "", state: account.state,
    }];
  });

  const sessions: NinjaSupervisionSession[] = (sessionsResult.data ?? []).map((session) => ({
    accountName: session.account_name, closingBalance: session.closing_balance === null ? null : Number(session.closing_balance),
    connectionName: session.connection_name, direction: session.direction, executionCount: session.execution_count,
    flatAt: session.flat_at, id: Number(session.id), instruments: session.instruments, openedAt: session.opened_at,
    openingBalance: session.opening_balance === null ? null : Number(session.opening_balance), quantity: session.quantity,
    result: session.result === null ? null : Number(session.result), settledAt: session.settled_at, status: session.status,
  }));

  const batchRows = batchesResult.data ?? [];
  const batchIds = batchRows.map((batch) => batch.id);
  const { data: memberRows } = batchIds.length > 0
    ? await service.from("ninja_operation_batch_members").select("batch_id,session_id,account_id,role,allocated_broker_result_cents").in("batch_id", batchIds)
    : { data: [] };
  const memberSessionIds = [...new Set((memberRows ?? []).map((member) => member.session_id))];
  const { data: memberSessions } = memberSessionIds.length > 0
    ? await service.from("ninja_operation_probe_sessions").select("id,account_name").in("id", memberSessionIds)
    : { data: [] };
  const sessionNameById = new Map((memberSessions ?? []).map((session) => [Number(session.id), session.account_name]));
  const companyIds = [...new Set(batchRows.flatMap((batch) => batch.accounting_company_id ? [batch.accounting_company_id] : []))];
  const { data: companyRows } = companyIds.length > 0
    ? await service.from("companies").select("id,display_name").in("id", companyIds)
    : { data: [] };
  const companyById = new Map((companyRows ?? []).map((company) => [company.id, company.display_name]));
  const batches: NinjaSupervisionBatch[] = batchRows.map((batch) => {
    const members = (memberRows ?? []).filter((member) => member.batch_id === batch.id);
    const brokerMember = members.find((member) => member.role === "broker");
    return {
      accountingMode: batch.accounting_mode, accountingStatus: batch.accounting_status,
      blockingReason: batch.accounting_blocking_reason,
      brokerAccount: brokerMember ? sessionNameById.get(Number(brokerMember.session_id)) ?? null : null,
      brokerResultInCents: Number(batch.broker_result_cents),
      company: batch.accounting_company_id ? companyById.get(batch.accounting_company_id) ?? null : null,
      distributedInCents: Number(batch.distributed_cents), id: batch.id, openedAt: batch.opened_at,
      operatedOn: batch.operated_on, phase: batch.accounting_phase,
      propAccounts: members.filter((member) => member.role === "prop").map((member) => ({
        accountId: member.account_id ?? "", accountName: sessionNameById.get(Number(member.session_id)) ?? "Cuenta prop",
        allocatedBrokerResultInCents: Number(member.allocated_broker_result_cents ?? 0),
      })),
      roundingDifferenceInCents: Number(batch.rounding_difference_cents), settledAt: batch.settled_at, status: batch.status,
    };
  });

  return {
    batches, connections,
    connector: { id: connector.id, lastSeenAt: connector.last_seen_at, pairedAt: connector.paired_at, status: "active", version: connector.connector_version },
    currentPeriod: period ? { id: period.id, month: period.period_month } : null,
    inventory: { accounts, observedAt: inventory?.observed_at ?? null }, links, sessions,
    user: { accessState: targetUser.access_state, email: targetUser.email, id: targetUser.id, name: targetUser.display_name },
  } as AdminNinjaTestSupervision;
}
