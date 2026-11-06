import { NextResponse } from "next/server";

import { calculateBrokerRatio } from "@/modules/rutyx/domain/broker-ratio";
import { contextById, nextNodeForOutcome, operationByNode } from "@/modules/rutyx/server/catalog";
import { advanceRutyxDemo, loadRutyxDemoSnapshot, startRutyxDemo, type DemoSession } from "@/modules/rutyx/server/demo";
import { loadRutyxSnapshot, requireRutyxUser, userOwnsAccount } from "@/modules/rutyx/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireRutyxUser();
  if (!access) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  try {
    if (new URL(request.url).searchParams.get("demo") === "1") return NextResponse.json(loadRutyxDemoSnapshot());
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  } catch {
    return NextResponse.json({ message: "Rutyx todavía no está habilitado en esta versión." }, { status: 503 });
  }
}

type StartBody = Readonly<{
  accountIds?: string[];
  action: "start";
  contextId?: string;
  fundingAccountCount?: number;
  strategyId?: string;
  demo?: boolean;
}>;

type ResultBody = Readonly<{
  accountId?: string;
  action: "result";
  outcome?: "SL" | "TP";
  revision?: number;
  demo?: boolean;
  demoSession?: DemoSession;
}>;

export async function POST(request: Request) {
  const access = await requireRutyxUser();
  if (!access) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => null) as StartBody | ResultBody | null;

  if (body?.demo && body.action === "start") {
    const result = startRutyxDemo([...new Set(body.accountIds ?? [])], body.strategyId?.trim() ?? "", body.contextId?.trim() ?? "");
    return result ? NextResponse.json(result) : NextResponse.json({ message: "No se pudo iniciar el ejemplo." }, { status: 400 });
  }

  if (body?.demo && body.action === "result" && body.accountId && (body.outcome === "TP" || body.outcome === "SL")) {
    const result = advanceRutyxDemo(body.demoSession ?? {}, body.accountId, body.outcome);
    return result ? NextResponse.json(result) : NextResponse.json({ message: "El ejemplo no pudo avanzar." }, { status: 400 });
  }

  if (body?.action === "start") {
    const accountIds = [...new Set(body.accountIds ?? [])];
    const strategyId = body.strategyId?.trim();
    const contextId = body.contextId?.trim();
    const fundingAccountCount = Number(body.fundingAccountCount);
    if (!strategyId || !contextId || !Number.isInteger(fundingAccountCount) || fundingAccountCount < 1 || fundingAccountCount > 100 || accountIds.length !== fundingAccountCount) {
      return NextResponse.json({ message: `Elegí exactamente ${fundingAccountCount || 1} cuentas para enlazar.` }, { status: 400 });
    }
    const snapshot = await loadRutyxSnapshot(access.userId, access.db);
    const availableAccountIds = new Set(snapshot.accounts.map((account) => account.id));
    if (accountIds.some((accountId) => !availableAccountIds.has(accountId))) return NextResponse.json({ message: "Una de las cuentas no está disponible para Rutyx." }, { status: 400 });
    const { data: entitlement } = await access.db.from("rutyx_route_entitlements").select("id").eq("user_id", access.userId).eq("strategy_id", strategyId).eq("enabled", true).maybeSingle();
    const context = contextById(strategyId, contextId);
    const operation = context ? operationByNode(strategyId, context.rootNodeId) : null;
    if (!entitlement || !context || !operation) return NextResponse.json({ message: "La ruta no está habilitada." }, { status: 403 });
    const brokerRatio = calculateBrokerRatio({
      coverageContractsPerAccount: operation.coverageContractsPerAccount,
      fundingAccountCount,
      routeContractsPerAccount: operation.routeContractsPerAccount,
    });
    const { data: previousRows } = await access.db.from("rutyx_route_states").select("account_id,revision").eq("user_id", access.userId).in("account_id", accountIds);
    const previousRevision = new Map((previousRows ?? []).map((row) => [row.account_id, row.revision]));
    const groupId = crypto.randomUUID();
    const payload = accountIds.map((accountId) => ({
      account_id: accountId,
      broker_ratio: brokerRatio,
      context_id: context.id,
      coverage_contracts_per_account: operation.coverageContractsPerAccount,
      funding_account_count: fundingAccountCount,
      group_id: groupId,
      node_id: operation.nodeId,
      phase: context.phase,
      revision: (previousRevision.get(accountId) ?? 0) + 1,
      route_contracts_per_account: operation.routeContractsPerAccount,
      strategy_id: strategyId,
      user_id: access.userId,
    }));
    const { data: states, error } = await access.db.from("rutyx_route_states").upsert(payload, { onConflict: "user_id,account_id" }).select("id,account_id");
    if (error || !states || states.length !== accountIds.length) return NextResponse.json({ message: "No se pudo iniciar la ruta." }, { status: 500 });
    await access.db.from("rutyx_route_events").insert(states.map((state) => ({
      account_id: state.account_id,
      broker_ratio: brokerRatio,
      configuration: { ...payload.find((row) => row.account_id === state.account_id), linkedAccountIds: accountIds },
      event_type: "started",
      route_state_id: state.id,
      to_node_id: operation.nodeId,
      user_id: access.userId,
    })));
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  }

  if (body?.action === "result" && (body.outcome === "TP" || body.outcome === "SL") && Number.isInteger(body.revision)) {
    if (!body.accountId || !await userOwnsAccount(access.db, access.userId, body.accountId)) {
      return NextResponse.json({ message: "La cuenta no pertenece al usuario." }, { status: 400 });
    }
    const { data: state } = await access.db.from("rutyx_route_states").select("*").eq("user_id", access.userId).eq("account_id", body.accountId).maybeSingle();
    if (!state || state.revision !== body.revision) return NextResponse.json({ message: "La ruta cambió. Actualizá antes de registrar el resultado." }, { status: 409 });
    const transition = nextNodeForOutcome(state.strategy_id, state.node_id, body.outcome);
    if (!transition) return NextResponse.json({ message: "Ese resultado no está documentado en la ruta." }, { status: 400 });
    const nextOperation = operationByNode(state.strategy_id, transition.nextNodeId);
    const coverageContracts = nextOperation?.coverageContractsPerAccount ?? Number(state.coverage_contracts_per_account);
    const routeContracts = nextOperation?.routeContractsPerAccount ?? Number(state.route_contracts_per_account);
    const brokerRatio = calculateBrokerRatio({
      coverageContractsPerAccount: coverageContracts,
      fundingAccountCount: Number(state.funding_account_count),
      routeContractsPerAccount: routeContracts,
    });
    const { data: groupStates } = await access.db.from("rutyx_route_states").select("id,account_id,revision,node_id").eq("user_id", access.userId).eq("group_id", state.group_id);
    if (!groupStates?.length || groupStates.some((member) => member.node_id !== state.node_id || member.revision !== state.revision)) {
      return NextResponse.json({ message: "Las cuentas enlazadas no están sincronizadas." }, { status: 409 });
    }
    const { data: updated, error } = await access.db.from("rutyx_route_states").update({
      broker_ratio: brokerRatio, coverage_contracts_per_account: coverageContracts, node_id: transition.nextNodeId,
      revision: state.revision + 1, route_contracts_per_account: routeContracts,
    }).eq("user_id", access.userId).eq("group_id", state.group_id).eq("revision", state.revision).select("id,account_id");
    if (error || !updated || updated.length !== groupStates.length) return NextResponse.json({ message: "La ruta cambió mientras guardábamos el resultado." }, { status: 409 });
    await access.db.from("rutyx_route_events").insert(updated.map((member) => ({
      account_id: member.account_id,
      broker_ratio: brokerRatio,
      configuration: { coverageContractsPerAccount: coverageContracts, fundingAccountCount: state.funding_account_count, routeContractsPerAccount: routeContracts },
      event_type: "result",
      from_node_id: state.node_id,
      outcome: body.outcome,
      route_state_id: member.id,
      to_node_id: transition.nextNodeId,
      user_id: access.userId,
    })));
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  }

  return NextResponse.json({ message: "Acción no válida." }, { status: 400 });
}
