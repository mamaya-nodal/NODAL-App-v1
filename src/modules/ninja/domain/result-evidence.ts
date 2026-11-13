import type { NinjaTelemetryRow } from "./operation-probe";

/** Independent cumulative realized-P&L observations, not the cash subtraction
 * used to construct a session. Missing/reset observations never prove a result. */
export function ninjaSessionResultEvidence(rows: readonly NinjaTelemetryRow[], openedAt: string,
  settledAt: string | null, result: number | null): "verified" | "conflict" | "unavailable" {
  if (!settledAt || result === null) return "unavailable";
  const ordered = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id);
  const balances = ordered.filter((row) => row.event_type === "balance" &&
    typeof row.payload.realizedProfitLoss === "number" && Number.isFinite(row.payload.realizedProfitLoss));
  const before = balances.filter((row) => row.occurred_at < openedAt).at(-1);
  const after = balances.filter((row) => row.occurred_at >= openedAt && row.occurred_at <= settledAt).at(-1);
  if (!before || !after || before.occurred_at.slice(0, 10) !== after.occurred_at.slice(0, 10)) return "unavailable";
  const executions = ordered.filter((row) => row.event_type === "execution" &&
    row.occurred_at >= openedAt && row.occurred_at <= settledAt);
  if (executions.length < 2 || after.occurred_at < executions.at(-1)!.occurred_at) return "unavailable";
  return Math.round((Number(after.payload.realizedProfitLoss) - Number(before.payload.realizedProfitLoss)) * 100)
    === Math.round(result * 100) ? "verified" : "conflict";
}

export const verifiesNinjaSessionResult = (rows: readonly NinjaTelemetryRow[], openedAt: string,
  settledAt: string | null, result: number | null) => ninjaSessionResultEvidence(rows, openedAt, settledAt, result) === "verified";
