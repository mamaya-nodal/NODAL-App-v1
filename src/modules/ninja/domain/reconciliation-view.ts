export function currentAndPreviousMonthKeys(now: Date) {
  const current = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  return [current, previous].map((date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
  );
}

export function splitReconciliationMonthKeys(
  monthKeys: readonly string[],
  currentMonthKey: string,
) {
  return {
    current: monthKeys.filter((month) => month === currentMonthKey),
    archived: monthKeys.filter((month) => month !== currentMonthKey),
  };
}

export function reconciliationPosition(
  direction: string | null,
  quantity: number,
  instruments: readonly string[],
) {
  const instrumentLabel = instruments.length > 0 ? instruments.join(" + ") : "Sin instrumento";
  if (!direction || quantity <= 0) return instrumentLabel;
  return `${direction} · ${quantity} ${instrumentLabel}`;
}

export function reconciliationPairLabel(
  brokerAccountName: string | null,
  propAccountNames: readonly string[],
) {
  const broker = brokerAccountName ?? "Broker sin identificar";
  const props = propAccountNames.length > 0 ? propAccountNames.join(", ") : "Sin cuentas prop";
  return `${broker} ↔ ${props}`;
}

export type ReconciliationChronology = Readonly<{
  controlNumber: number | null;
  id: string;
  occurredAt: string;
  operatedOn: string;
}>;

export function compareReconciliationChronology(
  left: ReconciliationChronology,
  right: ReconciliationChronology,
) {
  const operationalDate = right.operatedOn.localeCompare(left.operatedOn);
  if (operationalDate !== 0) return operationalDate;

  if (left.controlNumber !== null && right.controlNumber !== null) {
    const controlOrder = right.controlNumber - left.controlNumber;
    if (controlOrder !== 0) return controlOrder;
  }

  const momentOrder = right.occurredAt.localeCompare(left.occurredAt);
  return momentOrder !== 0 ? momentOrder : right.id.localeCompare(left.id);
}
