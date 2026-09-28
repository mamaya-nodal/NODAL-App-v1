import type { NinjaTelemetryRow } from "./operation-probe";

export type NinjaTechnicalOperation = Readonly<{
  accountName: string;
  closingBalance: number | null;
  connectionName: string;
  direction: "Long" | "Short" | null;
  executionCount: number;
  flatAt: string | null;
  instruments: readonly string[];
  lastEventAt: string;
  minimumNetLiquidation: number | null;
  minimumNetLiquidationAt: string | null;
  openedAt: string;
  openingBalance: number | null;
  openingEventId: number;
  quantity: number;
  result: number | null;
  settledAt: string | null;
  status: "closed" | "open" | "settling";
}>;

const settlementWindowMs = 10_000;

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function settledCashValue(row: NinjaTelemetryRow): number | null {
  if (row.event_type !== "balance") return null;
  const cashValue = numeric(row.payload.cashValue);
  const netLiquidation = numeric(row.payload.netLiquidation);
  if (cashValue === null) return null;
  if (netLiquidation === null) return cashValue;
  // Antes de la apertura Ninja puede descontar comisiones unos milisegundos
  // antes de informar la posición. Conservamos el último saldo realmente plano
  // para que esas comisiones formen parte del resultado de la operación.
  return netLiquidation !== null && netLiquidation > 0 && Math.abs(cashValue - netLiquidation) < 0.005
    ? cashValue
    : null;
}

function isOpenPosition(row: NinjaTelemetryRow) {
  return row.event_type === "position"
    && typeof row.payload.quantity === "number"
    && row.payload.quantity > 0
    && row.payload.marketPosition !== "Flat";
}

function isExplicitClosingExecution(row: NinjaTelemetryRow) {
  if (row.event_type !== "execution") return false;
  const action = typeof row.payload.orderAction === "string"
    ? row.payload.orderAction.toLowerCase()
    : "";
  return action === "sell" || action === "buytocover";
}

type WorkingOperation = {
  accountName: string;
  closingBalance: number | null;
  connectionName: string;
  direction: "Long" | "Short" | null;
  executionCount: number;
  flatAt: string | null;
  instruments: Set<string>;
  lastEventAt: string;
  minimumNetLiquidation: number | null;
  minimumNetLiquidationAt: string | null;
  openedAt: string;
  openingBalance: number | null;
  openingEventId: number;
  quantity: number;
  positions: Map<string, boolean>;
  sawOpenPosition: boolean;
};

function finish(operation: WorkingOperation, settledAt: string | null): NinjaTechnicalOperation {
  const status = settledAt ? "closed" : operation.flatAt ? "settling" : "open";
  const result = operation.openingBalance !== null && operation.closingBalance !== null
    ? Math.round((operation.closingBalance - operation.openingBalance) * 100) / 100
    : null;
  return {
    accountName: operation.accountName,
    closingBalance: operation.closingBalance,
    connectionName: operation.connectionName,
    direction: operation.direction,
    executionCount: operation.executionCount,
    flatAt: operation.flatAt,
    instruments: [...operation.instruments],
    lastEventAt: operation.lastEventAt,
    minimumNetLiquidation: operation.minimumNetLiquidation,
    minimumNetLiquidationAt: operation.minimumNetLiquidationAt,
    openedAt: operation.openedAt,
    openingBalance: operation.openingBalance,
    openingEventId: operation.openingEventId,
    quantity: operation.quantity,
    result,
    settledAt,
    status,
  };
}

export function buildNinjaTechnicalOperations(
  rows: readonly NinjaTelemetryRow[],
  now = new Date(),
  fallbackOpeningBalance: number | null = null,
): NinjaTechnicalOperation[] {
  const ordered = [...rows].sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at) || left.id - right.id,
  );
  const operations: NinjaTechnicalOperation[] = [];
  let previousBalance: number | null = fallbackOpeningBalance;
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
      previousBalance = settledCashValue(row) ?? previousBalance ?? numeric(row.payload.cashValue);
      continue;
    }
    if (!current && isExplicitClosingExecution(row)) continue;
    if (!current && row.event_type !== "execution" && !isOpenPosition(row)) continue;

    if (!current) {
      current = {
        accountName: row.account_name,
        closingBalance: null,
        connectionName: row.connection_name,
        direction: null,
        executionCount: 0,
        flatAt: null,
        instruments: new Set<string>(),
        lastEventAt: row.occurred_at,
        minimumNetLiquidation: null,
        minimumNetLiquidationAt: null,
        openedAt: row.occurred_at,
        openingBalance: previousBalance,
        openingEventId: row.id,
        quantity: 0,
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
        const direction = row.payload.marketPosition;
        if (direction === "Long" || direction === "Short") {
          current.direction ??= direction;
        }
        current.quantity = Math.max(current.quantity, Number(row.payload.quantity));
        current.sawOpenPosition = true;
        current.flatAt = null;
        current.closingBalance = null;
      } else if (current.sawOpenPosition && [...current.positions.values()].every((value) => !value)) {
        current.flatAt = row.occurred_at;
      }
    }

    if (row.event_type === "balance") {
      const cashValue = numeric(row.payload.cashValue);
      const netLiquidation = numeric(row.payload.netLiquidation);
      if (netLiquidation !== null && (current.minimumNetLiquidation === null || netLiquidation < current.minimumNetLiquidation)) {
        current.minimumNetLiquidation = netLiquidation;
        current.minimumNetLiquidationAt = row.occurred_at;
      }
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
