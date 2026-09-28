import { roundLikeSheets } from "@/modules/control-diario/domain/result-allocation";
import type { NinjaTechnicalOperation } from "./technical-operation";

export type ClassifiedTechnicalOperation = NinjaTechnicalOperation & Readonly<{
  accountId: string | null;
  role: "broker" | "prop";
}>;

export type AutomaticOperationBatch = Readonly<{
  broker: ClassifiedTechnicalOperation;
  brokerResultInCents: number;
  distributedInCents: number;
  props: ReadonlyArray<ClassifiedTechnicalOperation & Readonly<{ allocatedBrokerResultInCents: number }>>;
  roundingDifferenceInCents: number;
  status: "conflict" | "ready" | "unmatched";
}>;

const defaultOpeningToleranceMs = 2_500;

function opposite(left: NinjaTechnicalOperation["direction"], right: NinjaTechnicalOperation["direction"]) {
  return (left === "Long" && right === "Short") || (left === "Short" && right === "Long");
}

function normalizedInstrumentForCoverage(instrument: string) {
  const normalized = instrument.trim().toUpperCase().replace(/\s+/g, " ");
  const [root, ...contract] = normalized.split(" ");
  const normalizedRoot = root === "NQ" || root === "MNQ" ? "NQ" : root;
  return [normalizedRoot, ...contract].join(" ");
}

function compatibleSingleInstrument(left: NinjaTechnicalOperation, right: NinjaTechnicalOperation) {
  return left.instruments.length === 1 &&
    right.instruments.length === 1 &&
    normalizedInstrumentForCoverage(left.instruments[0]) ===
      normalizedInstrumentForCoverage(right.instruments[0]);
}

export function countBrokerContextProps(
  operations: readonly ClassifiedTechnicalOperation[],
  broker: ClassifiedTechnicalOperation,
  openingToleranceMs = defaultOpeningToleranceMs,
): number {
  return operations.filter((operation) =>
    operation.role === "prop" &&
    operation.status === "closed" &&
    Math.abs(Date.parse(operation.openedAt) - Date.parse(broker.openedAt)) <= openingToleranceMs &&
    opposite(operation.direction, broker.direction),
  ).length;
}

export function correlateAutomaticOperationBatches(
  operations: readonly ClassifiedTechnicalOperation[],
  openingToleranceMs = defaultOpeningToleranceMs,
): AutomaticOperationBatch[] {
  const closed = operations.filter((operation) => operation.status === "closed");
  const brokers = closed.filter((operation) => operation.role === "broker");
  const usedProps = new Set<number>();

  return brokers.map((broker) => {
    const candidates = closed
      .map((operation, index) => ({ index, operation }))
      .filter(({ index, operation }) =>
        operation.role === "prop" &&
        !usedProps.has(index) &&
        Math.abs(Date.parse(operation.openedAt) - Date.parse(broker.openedAt)) <= openingToleranceMs &&
        opposite(operation.direction, broker.direction) &&
        compatibleSingleInstrument(operation, broker),
      );
    const result = broker.result === null ? null : roundLikeSheets(broker.result * 100);
    const conflict = broker.instruments.length !== 1 || broker.direction === null || broker.quantity <= 0;
    if (candidates.length === 0 || result === null || conflict) {
      return {
        broker,
        brokerResultInCents: result ?? 0,
        distributedInCents: 0,
        props: [],
        roundingDifferenceInCents: result ?? 0,
        status: conflict ? "conflict" as const : "unmatched" as const,
      };
    }

    candidates.forEach((candidate) => usedProps.add(candidate.index));
    const perProp = roundLikeSheets(result / candidates.length);
    const props = candidates.map(({ operation }) => ({
      ...operation,
      allocatedBrokerResultInCents: perProp,
    }));
    const distributedInCents = perProp * props.length;
    return {
      broker,
      brokerResultInCents: result,
      distributedInCents,
      props,
      roundingDifferenceInCents: distributedInCents - result,
      status: "ready" as const,
    };
  });
}

export function brokerAccountConflicts(
  operations: readonly ClassifiedTechnicalOperation[],
): string[] {
  const active = operations.filter((operation) =>
    operation.role === "broker" && operation.status !== "closed",
  );
  const grouped = new Map<string, ClassifiedTechnicalOperation[]>();
  for (const operation of active) {
    const key = `${operation.connectionName}\u0000${operation.accountName}`;
    grouped.set(key, [...(grouped.get(key) ?? []), operation]);
  }
  return [...grouped.entries()]
    .filter(([, accountOperations]) => accountOperations.length > 1)
    .map(([key]) => key);
}
