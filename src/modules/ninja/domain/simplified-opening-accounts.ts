import { classifyNinjaAccount } from "./account-classification";
import { ninjaAccountRegistrationKey } from "./account-registration-key";
import type { NinjaAccountSnapshot } from "./ingestion-payload";

export type SimplifiedOpeningCandidate = Readonly<{
  accountName: string;
  companyId: string;
  companyName: string;
  connectionName: string;
  connectorId: string;
  firstSeenAt: string;
  phase: "Evaluation" | "Funded" | "Live";
}>;

type Input = Readonly<{
  companies: ReadonlyArray<Readonly<{
    code: string;
    displayName: string;
    id: string;
  }>>;
  inventories: ReadonlyArray<Readonly<{
    accounts: ReadonlyArray<NinjaAccountSnapshot & Readonly<{ firstSeenAt?: string }>>;
    connectorId: string;
    observedAt: string;
  }>>;
  registeredAccountKeys: ReadonlySet<string>;
}>;

export function buildSimplifiedOpeningAccounts({
  companies,
  inventories,
  registeredAccountKeys,
}: Input): SimplifiedOpeningCandidate[] {
  const companiesByCode = new Map(companies.map((company) => [company.code.toUpperCase(), company]));
  const seenAccountKeys = new Set<string>();

  return inventories.flatMap((inventory) => inventory.accounts.flatMap((account): SimplifiedOpeningCandidate[] => {
    const classification = classifyNinjaAccount(account, account.firstSeenAt ?? inventory.observedAt);
    if (classification.type !== "prop" || !classification.companyCode || !classification.phase) return [];

    const company = companiesByCode.get(classification.companyCode.toUpperCase());
    if (!company) return [];

    const key = ninjaAccountRegistrationKey(
      inventory.connectorId,
      classification.connectionName,
      classification.accountName,
    );
    if (registeredAccountKeys.has(key) || seenAccountKeys.has(key)) return [];
    seenAccountKeys.add(key);

    return [{
      accountName: classification.accountName,
      companyId: company.id,
      companyName: company.displayName,
      connectionName: classification.connectionName,
      connectorId: inventory.connectorId,
      firstSeenAt: classification.firstSeenAt,
      phase: classification.phase,
    }];
  }));
}
