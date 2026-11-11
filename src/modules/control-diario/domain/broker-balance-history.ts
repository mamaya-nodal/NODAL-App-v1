export type BrokerBalanceHistoryControl = Readonly<{
  balanceAfterInCents: number;
  balanceBeforeInCents: number | null;
  controlId: string;
  createdAt: string;
  kind: "balance_update" | "deposit" | "withdrawal";
  operatedOn: string | null;
  operatingResultInCents: number | null;
}>;

export type BrokerBalanceHistoryEvent = Readonly<{
  balanceInCents: number;
  controlId: string | null;
  id: string;
  observedAt: string;
  sourceEventId: string;
}>;

export type BrokerBalanceHistoryRow = Readonly<{
  balanceInCents: number;
  changeInCents: number | null;
  controlId: string | null;
  id: string;
  kind: "initial" | "operation";
  observedAt: string;
  previousBalanceInCents: number | null;
}>;

/**
 * El control contable es la fuente de verdad. El evento técnico sólo aporta la
 * hora exacta cuando existe; nunca puede ocultar una conciliación recuperada.
 */
export function buildBrokerBalanceHistory(
  controls: readonly BrokerBalanceHistoryControl[],
  events: readonly BrokerBalanceHistoryEvent[],
): BrokerBalanceHistoryRow[] {
  const controlIds = new Set(controls.map((control) => control.controlId));
  const eventByControlId = new Map(
    events
      .filter((event) => event.controlId && controlIds.has(event.controlId))
      .map((event) => [event.controlId as string, event] as const),
  );
  const controlRows = controls
    .filter((control) => control.kind === "balance_update")
    .map((control): BrokerBalanceHistoryRow => {
      const event = eventByControlId.get(control.controlId);
      return {
        balanceInCents: control.balanceAfterInCents,
        changeInCents: control.operatingResultInCents,
        controlId: control.controlId,
        id: event?.id ?? `daily-control:${control.controlId}`,
        kind: "operation",
        observedAt: event?.observedAt ?? control.createdAt ?? `${control.operatedOn ?? "1970-01-01"}T12:00:00-03:00`,
        previousBalanceInCents: control.balanceBeforeInCents,
      };
    });
  const standaloneEvents = events
    .filter((event) => !event.controlId || !controlIds.has(event.controlId))
    .map((event, index, rows): BrokerBalanceHistoryRow => {
      const previous = index === 0 ? null : rows[index - 1].balanceInCents;
      return {
        balanceInCents: event.balanceInCents,
        changeInCents: previous === null ? null : event.balanceInCents - previous,
        controlId: null,
        id: event.id,
        kind: event.sourceEventId.startsWith("ninja-operation:") ? "operation" : "initial",
        observedAt: event.observedAt,
        previousBalanceInCents: previous,
      };
    });

  return [...controlRows, ...standaloneEvents]
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
}
