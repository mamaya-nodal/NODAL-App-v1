export type BrokerEntryKind = "deposit" | "withdrawal" | "balance_update";

export const MANUAL_BROKER_ENTRY_DISABLED_MESSAGE =
  "Los depósitos, retiros y saldos manuales están deshabilitados hasta incorporarlos a Contabilidad.";

export function validateBrokerEntryAccess(
  kind: BrokerEntryKind,
  ninjaBalanceEventId: string | null | undefined,
): string | null {
  if (kind !== "balance_update" || !ninjaBalanceEventId) {
    return MANUAL_BROKER_ENTRY_DISABLED_MESSAGE;
  }

  return null;
}
