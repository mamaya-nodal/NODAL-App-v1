import "server-only";

import { calculateBrokerRatio } from "../domain/broker-ratio";
import type { RutyxAccount, RutyxRouteState } from "../domain/types";
import { listLucidStrategies, listStrategyContexts, operationByNode, RUTYX_COMPANY_CATALOG } from "./catalog";

type DemoEvent = Readonly<{
  account_id: string;
  broker_ratio: number;
  created_at: string;
  event_type: string;
  id: string;
  outcome: string | null;
  to_node_id: string;
}>;

export type DemoSession = Readonly<{
  events?: readonly DemoEvent[];
  states?: readonly RutyxRouteState[];
}>;

const identities = [
  { id: "demo-personal", name: "Titular · ejemplo" },
  { id: "demo-lorena", name: "Identidad Lorena · ejemplo" },
  { id: "demo-david", name: "Identidad David · ejemplo" },
] as const;

const accountGroups = [
  { count: 5, identityId: "demo-personal", identityName: "Titular · ejemplo", prefix: "LFE-DEMO-T" },
  { count: 3, identityId: "demo-lorena", identityName: "Identidad Lorena · ejemplo", prefix: "LFE-DEMO-L" },
  { count: 4, identityId: "demo-david", identityName: "Identidad David · ejemplo", prefix: "LFE-DEMO-D" },
] as const;

const accounts: RutyxAccount[] = accountGroups.flatMap((group) => Array.from({ length: group.count }, (_, index) => {
  const suffix = String(index + 1).padStart(2, "0");
  const externalName = `${group.prefix}${suffix}`;
  return {
    company: "LUCID",
    externalName,
    id: `demo-account-${group.identityId}-${suffix}`,
    identityId: group.identityId,
    identityName: group.identityName,
    label: `LUCID · ${externalName}`,
    state: "active",
  };
}));

export function loadRutyxDemoSnapshot(session: DemoSession = {}) {
  const strategies = listLucidStrategies(new Set(listLucidStrategies(new Set()).map((strategy) => strategy.id)));
  const enabledStrategies = strategies.map((strategy) => ({ ...strategy, enabled: true }));
  const states = [...(session.states ?? [])];
  const contexts = enabledStrategies.flatMap((strategy) => listStrategyContexts(strategy.id));
  const operations = Object.fromEntries(states.flatMap((state) => {
    const operation = operationByNode(state.strategyId, state.nodeId);
    return operation ? [[state.accountId, operation]] : [];
  }));
  return {
    accounts,
    companies: RUTYX_COMPANY_CATALOG,
    contexts,
    demo: true,
    events: session.events ?? [],
    identities,
    operations,
    states,
    strategies: enabledStrategies,
  };
}

export function startRutyxDemo(accountIds: readonly string[], strategyId: string, contextId: string) {
  const context = listStrategyContexts(strategyId).find((candidate) => candidate.id === contextId);
  const operation = context ? operationByNode(strategyId, context.rootNodeId) : null;
  const validIds = new Set(accounts.map((account) => account.id));
  if (!context || !operation || !accountIds.length || accountIds.some((id) => !validIds.has(id))) return null;
  const groupId = `demo-group-${crypto.randomUUID()}`;
  const brokerRatio = calculateBrokerRatio({
    coverageContractsPerAccount: operation.coverageContractsPerAccount,
    fundingAccountCount: accountIds.length,
    routeContractsPerAccount: operation.routeContractsPerAccount,
  });
  const states: RutyxRouteState[] = accountIds.map((accountId, index) => ({
    accountId,
    brokerRatio,
    contextId,
    coverageContractsPerAccount: operation.coverageContractsPerAccount,
    fundingAccountCount: accountIds.length,
    groupId,
    id: `demo-state-${index + 1}`,
    nodeId: operation.nodeId,
    phase: context.phase,
    revision: 1,
    routeContractsPerAccount: operation.routeContractsPerAccount,
    strategyId,
  }));
  const now = new Date().toISOString();
  const events: DemoEvent[] = accountIds.map((accountId, index) => ({
    account_id: accountId,
    broker_ratio: brokerRatio,
    created_at: now,
    event_type: "started",
    id: `demo-event-start-${index + 1}-${Date.now()}`,
    outcome: null,
    to_node_id: operation.nodeId,
  }));
  return loadRutyxDemoSnapshot({ events, states });
}

export function advanceRutyxDemo(session: DemoSession, accountId: string, outcome: "SL" | "TP") {
  const selected = session.states?.find((state) => state.accountId === accountId);
  if (!selected) return null;
  const operation = operationByNode(selected.strategyId, selected.nodeId);
  const transition = operation?.outcomes.find((candidate) => candidate.key === outcome);
  if (!transition) return null;
  const nextOperation = operationByNode(selected.strategyId, transition.nextNodeId);
  const groupStates = session.states?.filter((state) => state.groupId === selected.groupId) ?? [];
  const coverageContracts = nextOperation?.coverageContractsPerAccount ?? selected.coverageContractsPerAccount;
  const routeContracts = nextOperation?.routeContractsPerAccount ?? selected.routeContractsPerAccount;
  const brokerRatio = calculateBrokerRatio({
    coverageContractsPerAccount: coverageContracts,
    fundingAccountCount: selected.fundingAccountCount,
    routeContractsPerAccount: routeContracts,
  });
  const states = (session.states ?? []).map((state) => state.groupId === selected.groupId ? {
    ...state,
    brokerRatio,
    coverageContractsPerAccount: coverageContracts,
    nodeId: transition.nextNodeId,
    revision: state.revision + 1,
    routeContractsPerAccount: routeContracts,
  } : state);
  const now = new Date().toISOString();
  const newEvents: DemoEvent[] = groupStates.map((state, index) => ({
    account_id: state.accountId,
    broker_ratio: brokerRatio,
    created_at: now,
    event_type: "result",
    id: `demo-event-result-${Date.now()}-${index + 1}`,
    outcome,
    to_node_id: transition.nextNodeId,
  }));
  return loadRutyxDemoSnapshot({ events: [...newEvents, ...(session.events ?? [])], states });
}
