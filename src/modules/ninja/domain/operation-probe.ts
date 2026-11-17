export type NinjaTelemetryRow = Readonly<{
  account_name: string;
  connection_name: string;
  event_type: "balance" | "execution" | "position";
  id: number;
  instrument: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}>;

export type NinjaAccountProbe = Readonly<{
  accountName: string;
  cashValue: number | null;
  connectionName: string;
  executionCount: number;
  lastEventAt: string;
  netLiquidation: number | null;
  openPositions: number;
  status: "open" | "ready" | "settling" | "uncertain" | "waiting";
}>;

const settlementWindowMs = 10_000;

type TechnicalClosure = Readonly<{
  account_name: string;
  connection_name: string;
  opened_at: string;
  flat_at: string | null;
  settled_at: string | null;
  status: string;
  instruments: readonly string[];
}>;

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildNinjaOperationProbe(
  rows: readonly NinjaTelemetryRow[],
  now = new Date(),
  operations: readonly TechnicalClosure[] = [],
): NinjaAccountProbe[] {
  const grouped = new Map<string, NinjaTelemetryRow[]>();
  for (const row of rows) {
    const key = `${row.connection_name}\u0000${row.account_name}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.values()].map((accountRows) => {
    const ordered = [...accountRows].sort((left, right) =>
      left.occurred_at.localeCompare(right.occurred_at) || left.id - right.id,
    );
    const positions = new Map<string, { marketPosition: string; quantity: number; occurredAt: string }>();
    let sawOpenPosition = false;
    let executionCount = 0;
    let lastFlatAt: string | null = null;
    let lastBalanceAt: string | null = null;
    let cashValue: number | null = null;
    let netLiquidation: number | null = null;

    for (const row of ordered) {
      if (row.event_type === "execution") executionCount += 1;
      if (row.event_type === "balance") {
        lastBalanceAt = row.occurred_at;
        cashValue = money(row.payload.cashValue);
        netLiquidation = money(row.payload.netLiquidation);
      }
      if (row.event_type === "position" && row.instrument) {
        const quantity = typeof row.payload.quantity === "number" ? row.payload.quantity : 0;
        const marketPosition = typeof row.payload.marketPosition === "string"
          ? row.payload.marketPosition
          : "Unknown";
        positions.set(row.instrument, { marketPosition, quantity, occurredAt: row.occurred_at });
        if (marketPosition !== "Flat" && quantity > 0) sawOpenPosition = true;
        if (sawOpenPosition && [...positions.values()].every((position) =>
          position.marketPosition === "Flat" || position.quantity === 0,
        )) lastFlatAt = row.occurred_at;
      }
    }

    // The server can verify a closure from complete fills when the Flat callback
    // is missing. Render that derived fact without inventing a source event.
    const latestOperation = operations.filter((operation) => operation.account_name === ordered[0].account_name &&
      operation.connection_name === ordered[0].connection_name)
      .sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at))[0];
    if (latestOperation?.status === "closed" && latestOperation.flat_at && latestOperation.settled_at) {
      const opened = Date.parse(latestOperation.opened_at);
      const flat = Date.parse(latestOperation.flat_at);
      for (const [instrument, position] of positions) {
        const positionAt = Date.parse(position.occurredAt);
        const hasNewExecution = ordered.some((event) => event.event_type === "execution" &&
          event.instrument === instrument && Date.parse(event.occurred_at) > flat);
        if (latestOperation.instruments.includes(instrument) && positionAt >= opened && positionAt <= flat && !hasNewExecution) {
          positions.set(instrument, { ...position, marketPosition: "Flat", quantity: 0 });
          lastFlatAt = latestOperation.flat_at;
        }
      }
    }
    const openPositions = [...positions.values()].filter((position) =>
      position.marketPosition !== "Flat" && position.quantity > 0,
    ).length;
    const lastEventAt = ordered.at(-1)?.occurred_at ?? now.toISOString();
    let status: NinjaAccountProbe["status"] = "waiting";
    if (openPositions > 0) status = "open";
    else if (sawOpenPosition && lastFlatAt) {
      const hasPostFlatBalance = Boolean(lastBalanceAt && lastBalanceAt >= lastFlatAt);
      const quietFor = now.getTime() - Date.parse(lastEventAt);
      status = hasPostFlatBalance && quietFor >= settlementWindowMs ? "ready" : "settling";
    } else if (executionCount > 0) status = "uncertain";

    return {
      accountName: ordered[0].account_name,
      cashValue,
      connectionName: ordered[0].connection_name,
      executionCount,
      lastEventAt,
      netLiquidation,
      openPositions,
      status,
    };
  }).sort((left, right) => right.lastEventAt.localeCompare(left.lastEventAt));
}

