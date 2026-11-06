import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";

import type { RutyxAccount, RutyxRouteState } from "../domain/types";
import { listLucidStrategies, listStrategyContexts, operationByNode, RUTYX_COMPANY_CATALOG } from "./catalog";

export async function requireRutyxUser() {
  const session = await createClient();
  const { data: claimsData, error } = await session.auth.getClaims();
  const userId = error ? null : claimsData?.claims.sub;
  const email = typeof claimsData?.claims.email === "string" ? claimsData.claims.email : null;
  if (!userId || !canUseNodalAgentPilot(email)) return null;
  const db = createServiceClient();
  const { data: profile } = await db.from("nodal_users").select("access_state").eq("id", userId).maybeSingle();
  return profile?.access_state === "active" ? { db, userId } : null;
}

export async function loadRutyxSnapshot(userId: string, db = createServiceClient()) {
  const { data: workspaceRows } = await db.from("workspaces").select("id").eq("owner_user_id", userId);
  const workspaceIds = (workspaceRows ?? []).map((workspace) => workspace.id);
  const { data: periodRows } = workspaceIds.length
    ? await db.from("periods").select("id").in("workspace_id", workspaceIds)
    : { data: [] };
  const periodIds = (periodRows ?? []).map((period) => period.id);
  const { data: accountRows } = periodIds.length
    ? await db.from("accounts").select("id,company_id,reference_number,state").in("period_id", periodIds)
    : { data: [] };
  const accountIds = (accountRows ?? []).map((account) => account.id);
  const companyIds = [...new Set((accountRows ?? []).map((account) => account.company_id))];
  const [companiesResult, linksResult, assignmentsResult, identitiesResult, entitlementsResult, statesResult, eventsResult] = await Promise.all([
    companyIds.length ? db.from("companies").select("id,code,display_name").in("id", companyIds) : Promise.resolve({ data: [] }),
    accountIds.length ? db.from("ninja_account_links").select("account_id,external_account_name,linked_at,closed_at").in("account_id", accountIds).order("linked_at", { ascending: false }) : Promise.resolve({ data: [] }),
    accountIds.length ? db.from("identity_account_assignments").select("account_id,identity_id").in("account_id", accountIds).is("unassigned_at", null) : Promise.resolve({ data: [] }),
    workspaceIds.length ? db.from("nodal_identities").select("id,first_name,last_name").in("workspace_id", workspaceIds) : Promise.resolve({ data: [] }),
    db.from("rutyx_route_entitlements").select("strategy_id").eq("user_id", userId).eq("enabled", true),
    db.from("rutyx_route_states").select("id,account_id,strategy_id,context_id,phase,node_id,funding_account_count,coverage_contracts_per_account,route_contracts_per_account,broker_ratio,revision").eq("user_id", userId),
    db.from("rutyx_route_events").select("id,account_id,event_type,outcome,from_node_id,to_node_id,broker_ratio,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
  ]);
  const companyById = new Map((companiesResult.data ?? []).map((company) => [company.id, company]));
  const identityById = new Map((identitiesResult.data ?? []).map((identity) => [identity.id, `${identity.first_name} ${identity.last_name}`.trim()]));
  const identityByAccount = new Map((assignmentsResult.data ?? []).map((assignment) => [assignment.account_id, identityById.get(assignment.identity_id) ?? null]));
  const externalByAccount = new Map<string, string>();
  for (const link of linksResult.data ?? []) if (!externalByAccount.has(link.account_id)) externalByAccount.set(link.account_id, link.external_account_name);
  const accounts: RutyxAccount[] = (accountRows ?? []).flatMap((account) => {
    const company = companyById.get(account.company_id);
    if (company?.code !== "LUCID") return [];
    const externalName = externalByAccount.get(account.id) ?? `Cuenta ${account.reference_number}`;
    const identityName = identityByAccount.get(account.id) ?? null;
    return [{
      company: company.display_name,
      externalName,
      id: account.id,
      identityName,
      label: `${company.display_name} · ${externalName}`,
      state: account.state,
    }];
  });
  const enabledStrategyIds = new Set((entitlementsResult.data ?? []).map((row) => row.strategy_id));
  const strategies = listLucidStrategies(enabledStrategyIds);
  const states: RutyxRouteState[] = (statesResult.data ?? []).map((state) => ({
    accountId: state.account_id,
    brokerRatio: Number(state.broker_ratio),
    contextId: state.context_id,
    coverageContractsPerAccount: Number(state.coverage_contracts_per_account),
    fundingAccountCount: Number(state.funding_account_count),
    id: state.id,
    nodeId: state.node_id,
    phase: state.phase === "funded" ? "funded" : "eval",
    revision: state.revision,
    routeContractsPerAccount: Number(state.route_contracts_per_account),
    strategyId: state.strategy_id,
  }));
  const contexts = strategies.flatMap((strategy) => strategy.enabled ? listStrategyContexts(strategy.id) : []);
  const operations = Object.fromEntries(states.flatMap((state) => {
    const operation = operationByNode(state.strategyId, state.nodeId);
    return operation ? [[state.accountId, operation]] : [];
  }));
  return { accounts, companies: RUTYX_COMPANY_CATALOG, contexts, events: eventsResult.data ?? [], operations, states, strategies };
}

export async function userOwnsAccount(db: ReturnType<typeof createServiceClient>, userId: string, accountId: string) {
  const { data } = await db.from("accounts").select("id,periods!inner(workspaces!inner(owner_user_id))").eq("id", accountId).maybeSingle();
  const periods = data?.periods as unknown as { workspaces?: { owner_user_id?: string } | null } | null;
  return periods?.workspaces?.owner_user_id === userId;
}
