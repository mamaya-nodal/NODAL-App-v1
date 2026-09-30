/** A route is chosen by event time, never by the moment a delayed batch arrives. */
export type NinjaIntakeEpoch = Readonly<{
  effectiveFrom: string;
  destination: Readonly<{ ownerUserId: string; connectorId: string }> | null;
}>;

export type NinjaIntakeDecision =
  | Readonly<{ kind: "route"; ownerUserId: string; connectorId: string }>
  | Readonly<{ kind: "hold"; reason: "no-route" | "unclaimed-broker" | "other-owner" | "invalid-time" }>;

export function decideNinjaIntake(input: Readonly<{
  accountType: "prop" | "broker";
  accountOwnerUserId: string | null;
  epochs: readonly NinjaIntakeEpoch[];
  occurredAt: string;
}>): NinjaIntakeDecision {
  const occurredAtMs = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurredAtMs)) return { kind: "hold", reason: "invalid-time" };

  let selected: NinjaIntakeEpoch | null = null;
  let selectedFromMs = Number.NEGATIVE_INFINITY;
  for (const epoch of input.epochs) {
    const fromMs = Date.parse(epoch.effectiveFrom);
    if (Number.isFinite(fromMs) && fromMs <= occurredAtMs && fromMs > selectedFromMs) {
      selected = epoch;
      selectedFromMs = fromMs;
    }
  }
  if (!selected?.destination) return { kind: "hold", reason: "no-route" };

  const destination = selected.destination;
  if (input.accountType === "broker" && input.accountOwnerUserId === null) {
    return { kind: "hold", reason: "unclaimed-broker" };
  }
  if (input.accountOwnerUserId !== null && input.accountOwnerUserId !== destination.ownerUserId) {
    return { kind: "hold", reason: "other-owner" };
  }
  return { kind: "route", ...destination };
}
