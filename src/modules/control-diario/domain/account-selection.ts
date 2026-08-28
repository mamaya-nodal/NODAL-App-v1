export const OPERATION_PHASES = [
  "Evaluacion",
  "Primera vuelta",
  "Segunda vuelta",
  "Tercera vuelta",
  "Cuarta vuelta",
  "Quinta vuelta",
] as const;

export type OperationPhase = (typeof OPERATION_PHASES)[number];

export type DailyControlAccount = Readonly<{
  companyId: string;
  externalName?: string | null;
  id: string;
  referenceNumber: number;
}>;

export function accountsForCompany(
  accounts: DailyControlAccount[],
  companyId: string,
): DailyControlAccount[] {
  return accounts
    .filter((account) => account.companyId === companyId)
    .sort((left, right) => left.referenceNumber - right.referenceNumber);
}

export function chooseLeader(
  accountId: string,
  selectedReplicaIds: string[],
): { leaderId: string; replicaIds: string[] } {
  return {
    leaderId: accountId,
    replicaIds: selectedReplicaIds.filter((replicaId) => replicaId !== accountId),
  };
}

export function toggleReplica(
  leaderId: string,
  selectedReplicaIds: string[],
  accountId: string,
): string[] {
  if (!leaderId) {
    throw new Error("Primero debe seleccionarse una cuenta líder.");
  }

  if (accountId === leaderId) {
    throw new Error("La cuenta líder no puede seleccionarse como réplica.");
  }

  return selectedReplicaIds.includes(accountId)
    ? selectedReplicaIds.filter((replicaId) => replicaId !== accountId)
    : [...selectedReplicaIds, accountId];
}
