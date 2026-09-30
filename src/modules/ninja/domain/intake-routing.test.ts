import { describe, expect, it } from "vitest";
import { decideNinjaIntake, type NinjaIntakeEpoch } from "./intake-routing";

const personal = { ownerUserId: "personal", connectorId: "personal-scope" };
const identity = { ownerUserId: "owner", connectorId: "identity-scope" };
const epochs: NinjaIntakeEpoch[] = [
  { effectiveFrom: "2026-09-30T12:00:00Z", destination: personal },
  { effectiveFrom: "2026-09-30T13:00:00Z", destination: identity },
  { effectiveFrom: "2026-09-30T14:00:00Z", destination: personal },
];

describe("Ninja intake routing", () => {
  it("routes a delayed event to the destination active when it occurred", () => {
    expect(decideNinjaIntake({ accountType: "prop", accountOwnerUserId: null, epochs, occurredAt: "2026-09-30T13:30:00Z" }))
      .toEqual({ kind: "route", ...identity });
  });

  it("does not transfer an already claimed prop after switching modes", () => {
    expect(decideNinjaIntake({ accountType: "prop", accountOwnerUserId: "owner", epochs, occurredAt: "2026-09-30T14:30:00Z" }))
      .toEqual({ kind: "hold", reason: "other-owner" });
  });

  it("holds an unknown broker account rather than crediting the active ledger", () => {
    expect(decideNinjaIntake({ accountType: "broker", accountOwnerUserId: null, epochs, occurredAt: "2026-09-30T13:30:00Z" }))
      .toEqual({ kind: "hold", reason: "unclaimed-broker" });
  });

  it("does not send an identity-only installation to the owner while paused", () => {
    expect(decideNinjaIntake({ accountType: "prop", accountOwnerUserId: null,
      epochs: [{ effectiveFrom: "2026-09-30T12:00:00Z", destination: null }], occurredAt: "2026-09-30T13:30:00Z" }))
      .toEqual({ kind: "hold", reason: "no-route" });
  });

  it("never infers ownership from a numeric broker account", () => {
    expect(decideNinjaIntake({ accountType: "broker", accountOwnerUserId: "personal", epochs, occurredAt: "2026-09-30T13:30:00Z" }))
      .toEqual({ kind: "hold", reason: "other-owner" });
  });
});
