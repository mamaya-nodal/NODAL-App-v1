export type IdentityStatus = "approved" | "inactive" | "invited" | "received";
export type DocumentationStatus = "complete" | "pending" | "received";
export type CredentialsStatus = "complete" | "pending" | "update_required";
export type IdentityOperationalStatus = "active" | "configured" | "dead" | "unconfigured";

export type IdentityFundingCompany = Readonly<{
  code: string;
  id: string;
  name: string;
}>;

export type ManagedIdentity = Readonly<{
  contactEmail: string | null;
  credentialsStatus: CredentialsStatus;
  documentationStatus: DocumentationStatus;
  driveFolderUrl: string | null;
  firstName: string;
  id: string;
  lastName: string;
  onboardingStatus: IdentityStatus;
  operationalStatus: IdentityOperationalStatus;
}>;

export type IdentityRequestStatus = "accepted" | "rejected" | "sending" | "sent" | "submitted";

export type IdentityConnectorInstallation = Readonly<{
  createdAt: string;
  expiresAt: string;
  identityId: string;
  sentAt: string | null;
  status: "downloaded" | "failed" | "sending" | "sent";
}>;

export type IdentityOnboardingRequest = Readonly<{
  createdAt: string;
  documentReference: string | null;
  firstName: string | null;
  id: string;
  lastName: string | null;
  phone: string | null;
  recipientEmail: string;
  status: IdentityRequestStatus;
}>;

export type IdentityAccount = Readonly<{
  balanceInCents: number | null;
  companyCode: string;
  companyId: string;
  companyName: string;
  currentIdentityId: string | null;
  history: readonly IdentityAccountHistoryRow[];
  id: string;
  label: string;
  operationalState: string | null;
  payoutCount: number;
  payoutInCents: number;
  resultInCents: number;
  state: "closed" | "live" | "virgin";
  tradeCount: number;
}>;

export type IdentityAccountHistoryRow = Readonly<{
  accumulatedInCents: number;
  brokerResultInCents: number | null;
  concept: "Cobertura" | "Examen" | "Payout";
  phase: string;
  propResultInCents: number | null;
  tradeNumber: number | null;
}>;

export type IdentityWallet = Readonly<{
  balanceInCents: number;
  id: string;
  identityId: string | null;
  name: string;
}>;

export type IdentitySummary = ManagedIdentity & Readonly<{
  accounts: IdentityAccount[];
  burnedCompanyCount: number;
  companyPowers: IdentityCompanyPower[];
  connectorInstallation: IdentityConnectorInstallation | null;
  deteriorationLevel: 0 | 1 | 2 | 3;
  payoutTotalInCents: number;
  resultTotalInCents: number;
  wallets: IdentityWallet[];
}>;

export type IdentityCompanyPower = IdentityFundingCompany & Readonly<{
  burned: boolean;
  payoutCount: number;
  progress: number;
}>;

export const PAYOUTS_TO_BURN_COMPANY = 4;

export function calculateIdentityDeterioration(companyPowers: readonly IdentityCompanyPower[]): 0 | 1 | 2 | 3 {
  return Math.min(3, companyPowers.filter((company) => company.burned).length) as 0 | 1 | 2 | 3;
}

export function buildIdentitySummaries(
  identities: readonly ManagedIdentity[],
  accounts: readonly IdentityAccount[],
  connectorInstallations: readonly IdentityConnectorInstallation[] = [],
  wallets: readonly IdentityWallet[] = [],
  companies: readonly IdentityFundingCompany[] = [],
): IdentitySummary[] {
  return [...identities]
    .sort((left, right) =>
      left.lastName.localeCompare(right.lastName, "es")
      || left.firstName.localeCompare(right.firstName, "es"),
    )
    .map((identity) => {
      const assigned = accounts.filter((account) => account.currentIdentityId === identity.id);
      const payoutCountByCompany = new Map<string, number>();
      for (const account of assigned) {
        payoutCountByCompany.set(
          account.companyId,
          (payoutCountByCompany.get(account.companyId) ?? 0) + account.payoutCount,
        );
      }
      const companyPowers = companies.map((company): IdentityCompanyPower => {
        const payoutCount = payoutCountByCompany.get(company.id) ?? 0;
        return {
          ...company,
          burned: payoutCount >= PAYOUTS_TO_BURN_COMPANY,
          payoutCount,
          progress: Math.min(1, payoutCount / PAYOUTS_TO_BURN_COMPANY),
        };
      });
      return {
        ...identity,
        accounts: assigned,
        burnedCompanyCount: companyPowers.filter((company) => company.burned).length,
        companyPowers,
        connectorInstallation: connectorInstallations
          .filter((installation) => installation.identityId === identity.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null,
        payoutTotalInCents: assigned.reduce((total, account) => total + account.payoutInCents, 0),
        deteriorationLevel: calculateIdentityDeterioration(companyPowers),
        resultTotalInCents: assigned.reduce((total, account) => total + account.resultInCents, 0),
        wallets: wallets.filter((wallet) => wallet.identityId === identity.id),
      };
    });
}
