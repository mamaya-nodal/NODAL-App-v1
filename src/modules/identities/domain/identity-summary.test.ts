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
  operationalStatus: "unconfigured",
}];

const account = (input: Readonly<{
  companyId: string;
  currentIdentityId: string | null;
  id: string;
  payoutCount: number;
  payoutInCents: number;
  resultInCents: number;
}>) => ({
  balanceInCents: 50_500_00,
  companyCode: input.companyId.toUpperCase(),
  companyId: input.companyId,
  companyName: input.companyId,
  currentIdentityId: input.currentIdentityId,
  history: [],
  id: input.id,
  label: input.id,
  operationalState: "Funded",
  payoutCount: input.payoutCount,
  payoutInCents: input.payoutInCents,
  resultInCents: input.resultInCents,
  state: "live" as const,
  tradeCount: 1,
});

describe("buildIdentitySummaries", () => {
  it("atribuye cuentas y totales sin duplicar hechos economicos", () => {
    const [summary] = buildIdentitySummaries(identities, [
      account({ companyId: "lucid", currentIdentityId: "identity-1", id: "a", payoutCount: 1, payoutInCents: 100_000, resultInCents: 25_000 }),
      { ...account({ companyId: "lucid", currentIdentityId: "identity-1", id: "b", payoutCount: 1, payoutInCents: 50_000, resultInCents: -10_000 }), balanceInCents: null, state: "closed" as const, tradeCount: 2 },
      { ...account({ companyId: "lucid", currentIdentityId: null, id: "c", payoutCount: 8, payoutInCents: 999_999, resultInCents: 999_999 }), state: "virgin" as const, tradeCount: 0 },
    ], [], [
      { balanceInCents: 125_000, id: "wallet-1", identityId: "identity-1", name: "ARQ · Ana" },
      { balanceInCents: 50_000, id: "wallet-owner", identityId: null, name: "GrabrFi · Titular" },
    ]);

    expect(summary.accounts.map((account) => account.id)).toEqual(["a", "b"]);
    expect(summary.connectorInstallation).toBeNull();
    expect(summary.payoutTotalInCents).toBe(150_000);
    expect(summary.resultTotalInCents).toBe(15_000);
    expect(summary.wallets).toEqual([
      { balanceInCents: 125_000, id: "wallet-1", identityId: "identity-1", name: "ARQ · Ana" },
    ]);
  });

  it("conserva solo el envio mas reciente del conector por identidad", () => {
    const [summary] = buildIdentitySummaries(identities, [], [
      { createdAt: "2026-09-23T10:00:00Z", expiresAt: "2026-09-24T10:00:00Z", identityId: "identity-1", sentAt: null, status: "failed" },
      { createdAt: "2026-09-24T10:00:00Z", expiresAt: "2026-09-25T10:00:00Z", identityId: "identity-1", sentAt: "2026-09-24T10:01:00Z", status: "sent" },
    ]);

    expect(summary.connectorInstallation?.status).toBe("sent");
  });

  it("quema una empresa al cuarto payout y limita el deterioro automatico a tres", () => {
    const companies = ["lucid", "tradeify", "fff", "ftmo"].map((id) => ({ code: id.toUpperCase(), id, name: id }));
    const [summary] = buildIdentitySummaries(identities, [
      account({ companyId: "lucid", currentIdentityId: "identity-1", id: "a", payoutCount: 3, payoutInCents: 0, resultInCents: 0 }),
      account({ companyId: "tradeify", currentIdentityId: "identity-1", id: "b", payoutCount: 4, payoutInCents: 0, resultInCents: 0 }),
      account({ companyId: "fff", currentIdentityId: "identity-1", id: "c", payoutCount: 5, payoutInCents: 0, resultInCents: 0 }),
      account({ companyId: "ftmo", currentIdentityId: "identity-1", id: "d", payoutCount: 8, payoutInCents: 0, resultInCents: 0 }),
    ], [], [], companies);

    expect(summary.companyPowers.map(({ burned, payoutCount, progress }) => ({ burned, payoutCount, progress }))).toEqual([
      { burned: false, payoutCount: 3, progress: .75 },
      { burned: true, payoutCount: 4, progress: 1 },
      { burned: true, payoutCount: 5, progress: 1 },
      { burned: true, payoutCount: 8, progress: 1 },
    ]);
    expect(summary.burnedCompanyCount).toBe(3);
    expect(summary.deteriorationLevel).toBe(3);
  });
});
