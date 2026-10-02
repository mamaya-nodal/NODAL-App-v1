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
      { balanceInCents: 50_500_00, currentIdentityId: "identity-1", history: [], id: "a", label: "LUCID 1", operationalState: "Evaluation", payoutInCents: 100_000, resultInCents: 25_000, state: "live", tradeCount: 1 },
      { balanceInCents: null, currentIdentityId: "identity-1", history: [], id: "b", label: "LUCID 2", operationalState: "Funded", payoutInCents: 50_000, resultInCents: -10_000, state: "closed", tradeCount: 2 },
      { balanceInCents: 50_000_00, currentIdentityId: null, history: [], id: "c", label: "LUCID 3", operationalState: "Evaluation", payoutInCents: 999_999, resultInCents: 999_999, state: "virgin", tradeCount: 0 },
    ]);

    expect(summary.accounts.map((account) => account.id)).toEqual(["a", "b"]);
    expect(summary.connectorInstallation).toBeNull();
    expect(summary.payoutTotalInCents).toBe(150_000);
    expect(summary.resultTotalInCents).toBe(15_000);
  });

  it("conserva solo el envio mas reciente del conector por identidad", () => {
    const [summary] = buildIdentitySummaries(identities, [], [
      { createdAt: "2026-09-23T10:00:00Z", expiresAt: "2026-09-24T10:00:00Z", identityId: "identity-1", sentAt: null, status: "failed" },
      { createdAt: "2026-09-24T10:00:00Z", expiresAt: "2026-09-25T10:00:00Z", identityId: "identity-1", sentAt: "2026-09-24T10:01:00Z", status: "sent" },
    ]);

    expect(summary.connectorInstallation?.status).toBe("sent");
  });
});
