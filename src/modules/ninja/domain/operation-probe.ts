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

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildNinjaOperationProbe(
  rows: readonly NinjaTelemetryRow[],
  now = new Date(),
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
    const positions = new Map<string, { marketPosition: string; quantity: number }>();
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
        positions.set(row.instrument, { marketPosition, quantity });
        if (marketPosition !== "Flat" && quantity > 0) sawOpenPosition = true;
        if (sawOpenPosition && [...positions.values()].every((position) =>
          position.marketPosition === "Flat" || position.quantity === 0,
        )) lastFlatAt = row.occurred_at;
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

