export type PendingBrokerTransfer = Readonly<{
  balanceInCents: number;
  expectedBalanceInCents?: number;
  eventId: string;
  observedAt: string;
}>;

export function orderPendingBrokerTransfers(items: readonly PendingBrokerTransfer[]) {
  return [...new Map(items.map((item) => [item.eventId, item])).values()]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.eventId.localeCompare(b.eventId));
}

export function pendingBrokerDifference(item: PendingBrokerTransfer): number | null {
  return Number.isSafeInteger(item.balanceInCents) && Number.isSafeInteger(item.expectedBalanceInCents)
    ? item.balanceInCents - item.expectedBalanceInCents!
    : null;
}
