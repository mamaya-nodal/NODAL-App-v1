export function currentAndPreviousMonthKeys(now: Date) {
  const current = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  return [current, previous].map((date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
  );
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
