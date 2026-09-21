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
  currentIdentityId: string | null;
  id: string;
  label: string;
  payoutInCents: number;
  resultInCents: number;
  state: "closed" | "live" | "virgin";
}>;

export type IdentitySummary = ManagedIdentity & Readonly<{
  accounts: IdentityAccount[];
  payoutTotalInCents: number;
  resultTotalInCents: number;
}>;

export function buildIdentitySummaries(
  identities: readonly ManagedIdentity[],
  accounts: readonly IdentityAccount[],
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
        payoutTotalInCents: assigned.reduce((total, account) => total + account.payoutInCents, 0),
        resultTotalInCents: assigned.reduce((total, account) => total + account.resultInCents, 0),
      };
    });
}
