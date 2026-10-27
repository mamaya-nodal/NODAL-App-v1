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

function closingActionStartsPosition(
  row: NinjaTelemetryRow,
  rowIndex: number,
  ordered: readonly NinjaTelemetryRow[],
) {
  if (!isExplicitClosingExecution(row) || !row.instrument) return false;
  const occurredAt = Date.parse(row.occurred_at);
  return ordered.slice(rowIndex + 1).some((candidate) => {
    const delay = Date.parse(candidate.occurred_at) - occurredAt;
    if (delay > 2_000) return false;
    return delay >= 0 && candidate.instrument === row.instrument && isOpenPosition(candidate);
  });
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
  rows: NinjaTelemetryRow[];
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

type ClosedDirectionCycle = Readonly<{
  direction: "Long" | "Short";
  executions: readonly NinjaTelemetryRow[];
  flatAt: string;
  instrument: string;
  openedAt: string;
  openingEventId: number;
  quantity: number;
}>;

const pointValues: Readonly<Record<string, number>> = {
  ES: 50,
  MES: 5,
  MNQ: 2,
  NQ: 20,
  RTY: 50,
  M2K: 5,
};

function instrumentPointValue(instrument: string): number | null {
  const symbol = instrument.trim().toUpperCase().split(/\s+/u)[0];
  return pointValues[symbol] ?? null;
}

function closedDirectionCycles(rows: readonly NinjaTelemetryRow[]): ClosedDirectionCycle[] {
  const ordered = [...rows].sort((left, right) => left.id - right.id);
  const pendingExecutions = new Map<string, NinjaTelemetryRow[]>();
  const cycles: ClosedDirectionCycle[] = [];
  let active: {
    direction: "Long" | "Short";
    executions: NinjaTelemetryRow[];
    instrument: string;
    openedAt: string;
    openingEventId: number;
    quantity: number;
  } | null = null;

  for (const row of ordered) {
    if (row.event_type === "execution" && row.instrument) {
      pendingExecutions.set(row.instrument, [
        ...(pendingExecutions.get(row.instrument) ?? []),
        row,
      ]);
      continue;
    }
    if (row.event_type !== "position" || !row.instrument) continue;

    const queued = pendingExecutions.get(row.instrument) ?? [];
    pendingExecutions.set(row.instrument, []);
    const direction = row.payload.marketPosition;
    const quantity = numeric(row.payload.quantity) ?? 0;
    if ((direction === "Long" || direction === "Short") && quantity > 0) {
      if (!active) {
        active = {
          direction,
          executions: [...queued],
          instrument: row.instrument,
          openedAt: row.occurred_at,
          openingEventId: row.id,
          quantity,
        };
      } else if (active.instrument === row.instrument) {
        active.executions.push(...queued);
        active.quantity = Math.max(active.quantity, quantity);
      }
      continue;
    }
    if (direction === "Flat" && active?.instrument === row.instrument) {
      active.executions.push(...queued);
      cycles.push({ ...active, flatAt: row.occurred_at });
      active = null;
    }
  }
  return cycles;
}

function splitDirectionReversals(
  operation: NinjaTechnicalOperation,
  rows: readonly NinjaTelemetryRow[],
): NinjaTechnicalOperation[] {
  if (operation.status !== "closed" || operation.openingBalance === null
    || operation.closingBalance === null || operation.result === null
    || operation.instruments.length !== 1) return [operation];

  const cycles = closedDirectionCycles(rows);
  if (cycles.length < 2 || new Set(cycles.map((cycle) => cycle.direction)).size < 2) {
    return [operation];
  }

  const grossCents = cycles.map((cycle) => {
    if (cycle.executions.length !== 2) return null;
    const [entry, exit] = cycle.executions;
    const entryPrice = numeric(entry.payload.price);
    const exitPrice = numeric(exit.payload.price);
    const entryQuantity = numeric(entry.payload.quantity);
    const exitQuantity = numeric(exit.payload.quantity);
    const pointValue = instrumentPointValue(cycle.instrument);
    if (entryPrice === null || exitPrice === null || entryQuantity === null
      || entryQuantity <= 0 || entryQuantity !== exitQuantity || pointValue === null) return null;
    const points = cycle.direction === "Long"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice;
    return Math.round(points * entryQuantity * pointValue * 100);
  });
  if (grossCents.some((value) => value === null)) return [operation];

  const operationResultCents = Math.round(operation.result * 100);
  const totalGrossCents = grossCents.reduce<number>((total, value) => total + (value ?? 0), 0);
  const totalCostsCents = totalGrossCents - operationResultCents;
  // Sólo se separa cuando el neto puede explicarse como P&L bruto menos costos.
  // Ante telemetría incompleta se conserva el agregado para evitar inventar saldos.
  if (totalCostsCents < 0) return [operation];

  const weights = cycles.map((cycle) => cycle.executions.reduce((total, execution) =>
    total + (numeric(execution.payload.quantity) ?? 0), 0));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight <= 0) return [operation];

  let allocatedCostsCents = 0;
  let runningBalanceCents = Math.round(operation.openingBalance * 100);
  return cycles.map((cycle, index) => {
    const costCents = index === cycles.length - 1
      ? totalCostsCents - allocatedCostsCents
      : Math.round(totalCostsCents * weights[index] / totalWeight);
    allocatedCostsCents += costCents;
    const resultCents = (grossCents[index] ?? 0) - costCents;
    const openingBalanceCents = runningBalanceCents;
    runningBalanceCents += resultCents;
    const containsMinimum = operation.minimumNetLiquidationAt !== null
      && operation.minimumNetLiquidationAt >= cycle.openedAt
      && operation.minimumNetLiquidationAt <= cycle.flatAt;
    return {
      accountName: operation.accountName,
      closingBalance: runningBalanceCents / 100,
      connectionName: operation.connectionName,
      direction: cycle.direction,
      executionCount: cycle.executions.length,
      flatAt: cycle.flatAt,
      instruments: [cycle.instrument],
      lastEventAt: cycle.flatAt,
      minimumNetLiquidation: containsMinimum ? operation.minimumNetLiquidation : null,
      minimumNetLiquidationAt: containsMinimum ? operation.minimumNetLiquidationAt : null,
      openedAt: cycle.openedAt,
      openingBalance: openingBalanceCents / 100,
      openingEventId: cycle.openingEventId,
      quantity: cycle.quantity,
      result: resultCents / 100,
      settledAt: operation.settledAt,
      status: "closed" as const,
    };
  });
}

function finishAndSplit(operation: WorkingOperation, settledAt: string | null) {
  return splitDirectionReversals(finish(operation, settledAt), operation.rows);
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

  for (let rowIndex = 0; rowIndex < ordered.length; rowIndex += 1) {
    const row = ordered[rowIndex];
    const rowTime = Date.parse(row.occurred_at);
    if (current?.flatAt && current.closingBalance !== null
      && rowTime - Date.parse(current.lastEventAt) >= settlementWindowMs) {
      const settledAt = new Date(Date.parse(current.lastEventAt) + settlementWindowMs).toISOString();
      previousBalance = current.closingBalance;
      operations.push(...finishAndSplit(current, settledAt));
      current = null;
    }

    if (!current && row.event_type === "balance") {
      previousBalance = settledCashValue(row) ?? previousBalance ?? numeric(row.payload.cashValue);
      continue;
    }
    if (!current && isExplicitClosingExecution(row)
      && !closingActionStartsPosition(row, rowIndex, ordered)) continue;
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
        rows: [],
        sawOpenPosition: false,
      };
    }

    current.rows.push(row);
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
      const unrealizedProfitLoss = numeric(row.payload.unrealizedProfitLoss);
      if (!current.sawOpenPosition && current.executionCount > 0 && netLiquidation !== null
        && unrealizedProfitLoss === 0) {
        // Algunos proveedores descuentan la comisión de entrada antes de emitir
        // la primera posición. En ese instante el Net Liquidation todavía conserva
        // el saldo anterior al trade y es una referencia más completa que CashValue.
        current.openingBalance = current.openingBalance === null
          ? netLiquidation
          : Math.max(current.openingBalance, netLiquidation);
      }
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
    operations.push(...finishAndSplit(current, settledAt));
  }

  return operations;
}
