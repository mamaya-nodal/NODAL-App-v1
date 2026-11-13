import { roundLikeSheets } from "@/modules/control-diario/domain/result-allocation";
import type { NinjaTechnicalOperation } from "./technical-operation";

export type ClassifiedTechnicalOperation = NinjaTechnicalOperation & Readonly<{
  accountId: string | null;
  role: "broker" | "prop";
  sourceConnectorId?: string;
}>;

export type AutomaticOperationBatch = Readonly<{
  broker: ClassifiedTechnicalOperation;
  brokerResultInCents: number;
  distributedInCents: number;
  props: ReadonlyArray<ClassifiedTechnicalOperation & Readonly<{ allocatedBrokerResultInCents: number }>>;
  roundingDifferenceInCents: number;
  status: "conflict" | "ready" | "unmatched";
}>;

// El copiador puede informar la apertura prop algunos segundos después que la
// cobertura aun cuando pertenecen al mismo disparo operativo.
const defaultOpeningToleranceMs = 20_000;
const defaultSettlementToleranceMs = 2_000;

function temporallyAligned(
  left: NinjaTechnicalOperation,
  right: NinjaTechnicalOperation,
  openingToleranceMs: number,
) {
  // Settlement messages may arrive late; the positions themselves must overlap.
  const leftEnd = Date.parse(left.flatAt ?? left.lastEventAt);
  const rightEnd = Date.parse(right.flatAt ?? right.lastEventAt);
  if (Math.max(Date.parse(left.openedAt), Date.parse(right.openedAt)) > Math.min(leftEnd, rightEnd)) return false;
  if (Math.abs(Date.parse(left.openedAt) - Date.parse(right.openedAt)) <= openingToleranceMs) {
    return true;
  }
  return left.settledAt !== null && right.settledAt !== null &&
    Math.abs(Date.parse(left.settledAt) - Date.parse(right.settledAt)) <= defaultSettlementToleranceMs;
}

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

function logicalPropKey(operation: ClassifiedTechnicalOperation, index: number) {
  return operation.accountId === null ? `technical:${index}` : `account:${operation.accountId}`;
}

export function countBrokerContextProps(
  operations: readonly ClassifiedTechnicalOperation[],
  broker: ClassifiedTechnicalOperation,
  openingToleranceMs = defaultOpeningToleranceMs,
): number {
  return new Set(operations.flatMap((operation, index) =>
    operation.role === "prop" &&
      temporallyAligned(operation, broker, openingToleranceMs) &&
      opposite(operation.direction, broker.direction) &&
      compatibleSingleInstrument(operation, broker)
      ? [logicalPropKey(operation, index)]
      : [],
  )).size;
}

export function correlateAutomaticOperationBatches(
  operations: readonly ClassifiedTechnicalOperation[],
  openingToleranceMs = defaultOpeningToleranceMs,
): AutomaticOperationBatch[] {
  const closed = operations.filter((operation) => operation.status === "closed");
  const brokers = closed.filter((operation) => operation.role === "broker");
  const compatible = (prop: ClassifiedTechnicalOperation, broker: ClassifiedTechnicalOperation) =>
    prop.role === "prop" && temporallyAligned(prop, broker, openingToleranceMs) &&
    opposite(prop.direction, broker.direction) && compatibleSingleInstrument(prop, broker);
  const sameBrokerObservation = (a: ClassifiedTechnicalOperation, b: ClassifiedTechnicalOperation) =>
    a.accountName === b.accountName && a.direction === b.direction && a.quantity === b.quantity &&
    a.result === b.result && a.instruments.join() === b.instruments.join() &&
    Math.abs(Date.parse(a.openedAt) - Date.parse(b.openedAt)) <= 5_000;

  return brokers.map((broker) => {
    const technicalCandidates = closed
      .map((operation, index) => ({ index, operation }))
      .filter(({ index, operation }) =>
        operation.role === "prop" &&
        temporallyAligned(operation, broker, openingToleranceMs) &&
        opposite(operation.direction, broker.direction) &&
        compatibleSingleInstrument(operation, broker),
      );
    const logicalAccounts = new Set<string>();
    const candidates = technicalCandidates.filter(({ index, operation }) => {
      const key = logicalPropKey(operation, index);
      if (logicalAccounts.has(key)) return false;
      logicalAccounts.add(key);
      return true;
    });
    const result = broker.result === null ? null : roundLikeSheets(broker.result * 100);
    const ambiguous = technicalCandidates.some(({ operation }) => brokers.some((other) =>
      other !== broker && !sameBrokerObservation(other, broker) && compatible(operation, other)));
    const conflict = ambiguous || broker.instruments.length !== 1 || broker.direction === null || broker.quantity <= 0;
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

    // Dos conectores pueden observar la misma cuenta prop. Conservamos todas las
    // sesiones técnicas, pero la cuenta económica participa una sola vez.
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
