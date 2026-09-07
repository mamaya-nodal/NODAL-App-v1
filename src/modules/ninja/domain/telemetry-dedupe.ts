import type { NinjaTradeTelemetryEvent } from "./trade-telemetry";

export type PreviousTelemetryState = Readonly<{
  balanceSignature: string | null;
  eventType: NinjaTradeTelemetryEvent["kind"];
}>;

export function telemetryAccountKey(connectionName: string, accountName: string) {
  return `${connectionName}\u0000${accountName}`;
}

function balanceSignature(event: Extract<NinjaTradeTelemetryEvent, { kind: "balance" }>) {
  return JSON.stringify([
    event.cashValue,
    event.netLiquidation,
    event.totalCashBalance,
    event.realizedProfitLoss,
    event.unrealizedProfitLoss,
  ]);
}

export function collapseRepeatedBalanceTelemetry(
  events: readonly NinjaTradeTelemetryEvent[],
  previousByAccount: ReadonlyMap<string, PreviousTelemetryState>,
) {
  const state = new Map(previousByAccount);
  const retained: NinjaTradeTelemetryEvent[] = [];

  for (const event of events) {
    const key = telemetryAccountKey(event.connectionName, event.accountName);
    const previous = state.get(key);
    const signature = event.kind === "balance" ? balanceSignature(event) : null;

    if (event.kind === "balance"
      && previous?.eventType === "balance"
      && previous.balanceSignature === signature) continue;

    retained.push(event);
    state.set(key, { balanceSignature: signature, eventType: event.kind });
  }

  return retained;
}

export function storedTelemetryState(eventType: string, payload: Record<string, unknown>): PreviousTelemetryState | null {
  if (eventType === "execution" || eventType === "position") {
    return { balanceSignature: null, eventType };
  }
  if (eventType !== "balance") return null;
  return {
    balanceSignature: JSON.stringify([
      payload.cashValue ?? null,
      payload.netLiquidation ?? null,
      payload.totalCashBalance ?? null,
      payload.realizedProfitLoss ?? null,
      payload.unrealizedProfitLoss ?? null,
    ]),
    eventType: "balance",
  };
}
