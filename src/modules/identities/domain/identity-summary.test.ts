import { describe, expect, it } from "vitest";

import { buildIdentitySummaries, type ManagedIdentity } from "./identity-summary";

const identities: ManagedIdentity[] = [{
  contactEmail: "ana@example.com",
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
      { balanceInCents: 50_500_00, currentIdentityId: "identity-1", history: [], id: "a", label: "LUCID 1", payoutInCents: 100_000, phase: "Evaluation", resultInCents: 25_000, state: "live", tradeCount: 1 },
      { balanceInCents: null, currentIdentityId: "identity-1", history: [], id: "b", label: "LUCID 2", payoutInCents: 50_000, phase: "Funded", resultInCents: -10_000, state: "closed", tradeCount: 2 },
      { balanceInCents: 50_000_00, currentIdentityId: null, history: [], id: "c", label: "LUCID 3", payoutInCents: 999_999, phase: "Evaluation", resultInCents: 999_999, state: "virgin", tradeCount: 0 },
    ]);

    expect(summary.accounts.map((account) => account.id)).toEqual(["a", "b"]);
    expect(summary.payoutTotalInCents).toBe(150_000);
    expect(summary.resultTotalInCents).toBe(15_000);
  });
});
