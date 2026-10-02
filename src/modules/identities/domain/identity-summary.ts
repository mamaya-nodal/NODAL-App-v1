export type IdentityStatus = "approved" | "inactive" | "invited" | "received";
export type DocumentationStatus = "complete" | "pending" | "received";
export type CredentialsStatus = "complete" | "pending" | "update_required";

export type ManagedIdentity = Readonly<{
  contactEmail: string | null;
  credentialsStatus: CredentialsStatus;
  documentationStatus: DocumentationStatus;
  driveFolderUrl: string | null;
  firstName: string;
  id: string;
  lastName: string;
  onboardingStatus: IdentityStatus;
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
  currentIdentityId: string | null;
  history: readonly IdentityAccountHistoryRow[];
  id: string;
  label: string;
  operationalState: string | null;
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

export type IdentitySummary = ManagedIdentity & Readonly<{
  accounts: IdentityAccount[];
  connectorInstallation: IdentityConnectorInstallation | null;
  payoutTotalInCents: number;
  resultTotalInCents: number;
}>;

export function buildIdentitySummaries(
  identities: readonly ManagedIdentity[],
  accounts: readonly IdentityAccount[],
  connectorInstallations: readonly IdentityConnectorInstallation[] = [],
): IdentitySummary[] {
  return [...identities]
    .sort((left, right) =>
      left.lastName.localeCompare(right.lastName, "es")
      || left.firstName.localeCompare(right.firstName, "es"),
    )
    .map((identity) => {
      const assigned = accounts.filter((account) => account.currentIdentityId === identity.id);
      return {
        ...identity,
        accounts: assigned,
        connectorInstallation: connectorInstallations
          .filter((installation) => installation.identityId === identity.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null,
        payoutTotalInCents: assigned.reduce((total, account) => total + account.payoutInCents, 0),
        resultTotalInCents: assigned.reduce((total, account) => total + account.resultInCents, 0),
      };
    });
}
