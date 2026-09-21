import { describe, expect, it } from "vitest";

import { buildIdentitySummaries, type ManagedIdentity } from "./identity-summary";

const identities: ManagedIdentity[] = [{
  credentialsStatus: "pending",
  documentationStatus: "received",
  driveFolderUrl: null,
  firstName: "Ana",
  id: "identity-1",
  lastName: "Pérez",
  onboardingStatus: "received",
}];

describe("buildIdentitySummaries", () => {
  it("atribuye cuentas y totales sin duplicar hechos economicos", () => {
    const [summary] = buildIdentitySummaries(identities, [
      { currentIdentityId: "identity-1", id: "a", label: "LUCID 1", payoutInCents: 100_000, resultInCents: 25_000, state: "live" },
      { currentIdentityId: "identity-1", id: "b", label: "LUCID 2", payoutInCents: 50_000, resultInCents: -10_000, state: "closed" },
      { currentIdentityId: null, id: "c", label: "LUCID 3", payoutInCents: 999_999, resultInCents: 999_999, state: "virgin" },
    ]);

    expect(summary.accounts.map((account) => account.id)).toEqual(["a", "b"]);
    expect(summary.payoutTotalInCents).toBe(150_000);
    expect(summary.resultTotalInCents).toBe(15_000);
  });
});
