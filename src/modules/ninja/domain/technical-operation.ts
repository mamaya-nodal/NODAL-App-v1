import type { NinjaTelemetryRow } from "./operation-probe";

export type NinjaTechnicalOperation = Readonly<{
  accountName: string;
  closingBalance: number | null;
  connectionName: string;
  executionCount: number;
  flatAt: string | null;
  instruments: readonly string[];
  lastEventAt: string;
  openedAt: string;
  openingBalance: number | null;
  openingEventId: number;
  result: number | null;
  settledAt: string | null;
  status: "closed" | "open" | "settling";
}>;

const settlementWindowMs = 10_000;

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isOpenPosition(row: NinjaTelemetryRow) {
  return row.event_type === "position"
    && typeof row.payload.quantity === "number"
    && row.payload.quantity > 0
    && row.payload.marketPosition !== "Flat";
}

type WorkingOperation = {
  accountName: string;
  closingBalance: number | null;
  connectionName: string;
  executionCount: number;
  flatAt: string | null;
  instruments: Set<string>;
  lastEventAt: string;
  openedAt: string;
  openingBalance: number | null;
  openingEventId: number;
  positions: Map<string, boolean>;
  sawOpenPosition: boolean;
};

function finish(operation: WorkingOperation, settledAt: string | null): NinjaTechnicalOperation {
  const status = settledAt ? "closed" : operation.flatAt ? "settling" : "open";
  const result = operation.openingBalance !== null && operation.closingBalance !== null
    ? operation.closingBalance - operation.openingBalance
    : null;
  return {
    accountName: operation.accountName,
    closingBalance: operation.closingBalance,
    connectionName: operation.connectionName,
    executionCount: operation.executionCount,
    flatAt: operation.flatAt,
    instruments: [...operation.instruments],
    lastEventAt: operation.lastEventAt,
    openedAt: operation.openedAt,
    openingBalance: operation.openingBalance,
    openingEventId: operation.openingEventId,
    result,
    settledAt,
    status,
  };
}

export function buildNinjaTechnicalOperations(
  rows: readonly NinjaTelemetryRow[],
  now = new Date(),
): NinjaTechnicalOperation[] {
  const ordered = [...rows].sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at) || left.id - right.id,
  );
  const operations: NinjaTechnicalOperation[] = [];
  let previousBalance: number | null = null;
  let current: WorkingOperation | null = null;

  for (const row of ordered) {
    const rowTime = Date.parse(row.occurred_at);
    if (current?.flatAt && current.closingBalance !== null
      && rowTime - Date.parse(current.lastEventAt) >= settlementWindowMs) {
      const settledAt = new Date(Date.parse(current.lastEventAt) + settlementWindowMs).toISOString();
      previousBalance = current.closingBalance;
      operations.push(finish(current, settledAt));
      current = null;
    }

    if (!current && row.event_type === "balance") {
      previousBalance = numeric(row.payload.cashValue);
      continue;
    }
    if (!current && row.event_type !== "execution" && !isOpenPosition(row)) continue;

    if (!current) {
      current = {
        accountName: row.account_name,
        closingBalance: null,
        connectionName: row.connection_name,
        executionCount: 0,
        flatAt: null,
        instruments: new Set<string>(),
        lastEventAt: row.occurred_at,
        openedAt: row.occurred_at,
        openingBalance: previousBalance,
        openingEventId: row.id,
        positions: new Map<string, boolean>(),
        sawOpenPosition: false,
      };
    }

    current.lastEventAt = row.occurred_at;
    if (row.instrument) current.instruments.add(row.instrument);
    if (row.event_type === "execution") current.executionCount += 1;

    if (row.event_type === "position" && row.instrument) {
      const open = isOpenPosition(row);
      current.positions.set(row.instrument, open);
      if (open) {
        current.sawOpenPosition = true;
        current.flatAt = null;
        current.closingBalance = null;
      } else if (current.sawOpenPosition && [...current.positions.values()].every((value) => !value)) {
        current.flatAt = row.occurred_at;
      }
    }

    if (row.event_type === "balance") {
      const cashValue = numeric(row.payload.cashValue);
      if (current.flatAt && row.occurred_at >= current.flatAt) current.closingBalance = cashValue;
    }
  }

  if (current) {
    const quietFor = now.getTime() - Date.parse(current.lastEventAt);
    const settledAt = current.flatAt && current.closingBalance !== null && quietFor >= settlementWindowMs
      ? new Date(Date.parse(current.lastEventAt) + settlementWindowMs).toISOString()
      : null;
    operations.push(finish(current, settledAt));
  }

  return operations;
}
