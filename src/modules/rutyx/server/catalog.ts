import "server-only";

import catalog from "../../../../private/rutyx/v13/catalog.json";

import type { RutyxContext, RutyxOperation, RutyxStrategy } from "../domain/types";

type CatalogNode = {
  book: string;
  controls?: readonly (number | string)[];
  id: string;
  kind: string;
  outcomes?: Record<string, string>;
  session?: number;
  stage?: string;
};

type CatalogEdge = {
  broker_net: number;
  fund_net: number;
  outcome: string;
  to: string;
};

const nodes = catalog.nodes as Record<string, CatalogNode>;
const edges = catalog.edges as unknown as Record<string, CatalogEdge>;

const lucidBooks = (catalog.summary.base_books as readonly {
  company: string;
  file: string;
  name: string;
  strategy_id: string;
}[]).filter((book) => book.company === "LUCID");

export const RUTYX_COMPANY_CATALOG = [
  { company: "LUCID", enabled: true, id: "LUCID", name: "Lucid" },
  { company: "FTMO", enabled: false, id: "FTMO", name: "FTMO" },
  { company: "TRADEIFY", enabled: false, id: "TRADEIFY", name: "Tradeify" },
] as const;

export function listLucidStrategies(enabledStrategyIds: ReadonlySet<string>): RutyxStrategy[] {
  return lucidBooks.map((book) => ({
    company: "LUCID",
    enabled: enabledStrategyIds.has(book.strategy_id),
    id: book.strategy_id,
    name: book.name,
  }));
}

export function strategyBook(strategyId: string): string | null {
  return lucidBooks.find((book) => book.strategy_id === strategyId)?.file ?? null;
}

export function listStrategyContexts(strategyId: string): RutyxContext[] {
  const book = strategyBook(strategyId);
  if (!book) return [];
  return (catalog.contexts as readonly {
    book: string;
    id: string;
    label: string;
    phase: string;
    root: string;
  }[]).filter((context) => context.book === book).map((context) => ({
    id: context.id,
    label: context.label,
    phase: context.phase === "funded" ? "funded" : "eval",
    rootNodeId: context.root,
    strategyId,
  }));
}

export function contextById(strategyId: string, contextId: string): RutyxContext | null {
  return listStrategyContexts(strategyId).find((context) => context.id === contextId) ?? null;
}

export function operationByNode(strategyId: string, nodeId: string): RutyxOperation | null {
  const book = strategyBook(strategyId);
  const node = nodes[nodeId];
  if (!book || !node || node.book !== book || node.kind !== "operation" || !node.controls) return null;
  const outcomes = Object.entries(node.outcomes ?? {}).flatMap(([key, edgeId]) => {
    const edge = edges[edgeId];
    const next = edge ? nodes[edge.to] : null;
    if (!edge || !next || !Number.isFinite(edge.fund_net) || !Number.isFinite(edge.broker_net) || (key !== "TP" && key !== "SL")) return [];
    return [{
      brokerNet: Number(edge.broker_net),
      fundingNet: Number(edge.fund_net),
      key,
      nextKind: next.kind,
      nextNodeId: next.id,
      nextStage: next.stage ?? (next.kind === "terminal" ? "Fin de rama" : "Siguiente paso"),
    } as const];
  });
  return {
    brokerInstrument: String(node.controls[7]),
    coverageContractsPerAccount: Number(node.controls[8]),
    fundingInstrument: String(node.controls[2]),
    nodeId,
    outcomes,
    routeContractsPerAccount: Number(node.controls[3]),
    session: Number(node.session ?? node.controls[0]),
    slPips: Number(node.controls[5]),
    stage: String(node.stage ?? node.controls[1]),
    tpPips: Number(node.controls[4]),
  };
}

export function nextNodeForOutcome(strategyId: string, nodeId: string, outcome: "SL" | "TP") {
  return operationByNode(strategyId, nodeId)?.outcomes.find((candidate) => candidate.key === outcome) ?? null;
}
