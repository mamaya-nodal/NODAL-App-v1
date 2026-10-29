type AccountRow = Readonly<{ account_name: string }>;
type BatchRow = Readonly<{ broker: Readonly<{ account_name?: string | null }> | null }>;

function accountKey(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

/** Raw telemetry remains auditable, but the user's Operations screen may only
 * expose broker numbers whose ownership is already confirmed. Pending and
 * discarded partitions are observation sources, not part of that ledger. */
export function filterNinjaTelemetryReadScope<
  Event extends AccountRow,
  Operation extends AccountRow,
  Batch extends BatchRow,
>(input: Readonly<{
  batches: readonly Batch[];
  events: readonly Event[];
  hiddenBrokerAccountNames: readonly string[];
  operations: readonly Operation[];
}>) {
  const hidden = new Set(input.hiddenBrokerAccountNames.map(accountKey).filter(Boolean));
  return {
    batches: input.batches.filter((batch) => !hidden.has(accountKey(batch.broker?.account_name))),
    events: input.events.filter((event) => !hidden.has(accountKey(event.account_name))),
    operations: input.operations.filter((operation) => !hidden.has(accountKey(operation.account_name))),
  };
}
