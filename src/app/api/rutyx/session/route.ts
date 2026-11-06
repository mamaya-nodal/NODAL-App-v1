import { NextResponse } from "next/server";

import { calculateBrokerRatio } from "@/modules/rutyx/domain/broker-ratio";
import { contextById, nextNodeForOutcome, operationByNode } from "@/modules/rutyx/server/catalog";
import { loadRutyxSnapshot, requireRutyxUser, userOwnsAccount } from "@/modules/rutyx/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireRutyxUser();
  if (!access) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  try {
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  } catch {
    return NextResponse.json({ message: "Rutyx todavía no está habilitado en esta versión." }, { status: 503 });
  }
}

type StartBody = Readonly<{
  accountId?: string;
  action?: "start";
  contextId?: string;
  fundingAccountCount?: number;
  strategyId?: string;
}>;

type ResultBody = Readonly<{
  accountId?: string;
  action?: "result";
  outcome?: "SL" | "TP";
  revision?: number;
}>;

export async function POST(request: Request) {
  const access = await requireRutyxUser();
  if (!access) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => null) as StartBody | ResultBody | null;
  if (!body?.accountId || !await userOwnsAccount(access.db, access.userId, body.accountId)) {
    return NextResponse.json({ message: "La cuenta no pertenece al usuario." }, { status: 400 });
  }

  if (body.action === "start") {
    const strategyId = body.strategyId?.trim();
    const contextId = body.contextId?.trim();
    const fundingAccountCount = Number(body.fundingAccountCount);
    if (!strategyId || !contextId || !Number.isInteger(fundingAccountCount) || fundingAccountCount < 1 || fundingAccountCount > 100) {
      return NextResponse.json({ message: "Completá la ruta y la cantidad de cuentas." }, { status: 400 });
    }
    const { data: entitlement } = await access.db.from("rutyx_route_entitlements").select("id").eq("user_id", access.userId).eq("strategy_id", strategyId).eq("enabled", true).maybeSingle();
    const context = contextById(strategyId, contextId);
    const operation = context ? operationByNode(strategyId, context.rootNodeId) : null;
    if (!entitlement || !context || !operation) return NextResponse.json({ message: "La ruta no está habilitada." }, { status: 403 });
    const brokerRatio = calculateBrokerRatio({
      coverageContractsPerAccount: operation.coverageContractsPerAccount,
      fundingAccountCount,
      routeContractsPerAccount: operation.routeContractsPerAccount,
    });
    const { data: previous } = await access.db.from("rutyx_route_states").select("id,revision").eq("user_id", access.userId).eq("account_id", body.accountId).maybeSingle();
    const payload = {
      account_id: body.accountId,
      broker_ratio: brokerRatio,
      context_id: context.id,
      coverage_contracts_per_account: operation.coverageContractsPerAccount,
      funding_account_count: fundingAccountCount,
      node_id: operation.nodeId,
      phase: context.phase,
      revision: (previous?.revision ?? 0) + 1,
      route_contracts_per_account: operation.routeContractsPerAccount,
      strategy_id: strategyId,
      user_id: access.userId,
    };
    const { data: state, error } = await access.db.from("rutyx_route_states").upsert(payload, { onConflict: "user_id,account_id" }).select("id").single();
    if (error || !state) return NextResponse.json({ message: "No se pudo iniciar la ruta." }, { status: 500 });
    await access.db.from("rutyx_route_events").insert({
      account_id: body.accountId,
      broker_ratio: brokerRatio,
      configuration: payload,
      event_type: "started",
      route_state_id: state.id,
      to_node_id: operation.nodeId,
      user_id: access.userId,
    });
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  }

  if (body.action === "result" && (body.outcome === "TP" || body.outcome === "SL") && Number.isInteger(body.revision)) {
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
    const { data: updated, error } = await access.db.from("rutyx_route_states").update({
      broker_ratio: brokerRatio,
      coverage_contracts_per_account: coverageContracts,
      node_id: transition.nextNodeId,
      revision: state.revision + 1,
      route_contracts_per_account: routeContracts,
    }).eq("id", state.id).eq("revision", state.revision).select("id").maybeSingle();
    if (error || !updated) return NextResponse.json({ message: "La ruta cambió mientras guardábamos el resultado." }, { status: 409 });
    await access.db.from("rutyx_route_events").insert({
      account_id: body.accountId,
      broker_ratio: brokerRatio,
      configuration: { coverageContractsPerAccount: coverageContracts, fundingAccountCount: state.funding_account_count, routeContractsPerAccount: routeContracts },
      event_type: "result",
      from_node_id: state.node_id,
      outcome: body.outcome,
      route_state_id: state.id,
      to_node_id: transition.nextNodeId,
      user_id: access.userId,
    });
    return NextResponse.json(await loadRutyxSnapshot(access.userId, access.db));
  }

  return NextResponse.json({ message: "Acción no válida." }, { status: 400 });
}
