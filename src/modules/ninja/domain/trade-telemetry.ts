export type NinjaExecutionTelemetryEvent = Readonly<{
  accountName: string;
  connectionName: string;
  eventId: string;
  executionId: string;
  instrument: string;
  kind: "execution";
  marketPosition: string;
  occurredAt: string;
  orderAction: string;
  orderId: string;
  price: number;
  providerName: string;
  quantity: number;
}>;

export type NinjaPositionTelemetryEvent = Readonly<{
  accountName: string;
  averagePrice: number;
  connectionName: string;
  eventId: string;
  instrument: string;
  kind: "position";
  marketPosition: string;
  occurredAt: string;
  providerName: string;
  quantity: number;
}>;

export type NinjaBalanceTelemetryEvent = Readonly<{
  accountName: string;
  cashValue: number | null;
  connectionName: string;
  eventId: string;
  kind: "balance";
  netLiquidation: number | null;
  occurredAt: string;
  providerName: string;
  realizedProfitLoss: number | null;
  totalCashBalance: number | null;
  unrealizedProfitLoss: number | null;
}>;

export type NinjaTradeTelemetryEvent =
  | NinjaExecutionTelemetryEvent
  | NinjaPositionTelemetryEvent
  | NinjaBalanceTelemetryEvent;

export type NinjaTradeTelemetryBatch = Readonly<{
  batchId: string;
  events: readonly NinjaTradeTelemetryEvent[];
  kind: "trade_telemetry_batch";
  observedAt: string;
}>;

const maximumEvents = 100;
const maximumTextLength = 160;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumTextLength;
}

function isTimestamp(value: unknown): value is string {
  return isText(value) && Number.isFinite(Date.parse(value));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMoney(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function hasCommonFields(event: Record<string, unknown>) {
  return isText(event.eventId)
    && isTimestamp(event.occurredAt)
    && isText(event.accountName)
    && isText(event.connectionName)
    && isText(event.providerName);
}

function isEvent(value: unknown): value is NinjaTradeTelemetryEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (!hasCommonFields(event)) return false;

  if (event.kind === "position") {
    return isText(event.instrument)
      && isText(event.marketPosition)
      && isNumber(event.averagePrice)
      && Number.isInteger(event.quantity)
      && Number(event.quantity) >= 0;
  }
  if (event.kind === "execution") {
    return isText(event.instrument)
      && isText(event.marketPosition)
      && isText(event.executionId)
      && isText(event.orderId)
      && isText(event.orderAction)
      && isNumber(event.price)
      && Number.isInteger(event.quantity)
      && Number(event.quantity) > 0;
  }
  if (event.kind === "balance") {
    return isMoney(event.cashValue)
      && isMoney(event.netLiquidation)
      && isMoney(event.totalCashBalance)
      && isMoney(event.realizedProfitLoss)
      && isMoney(event.unrealizedProfitLoss);
  }
  return false;
}

export function isNinjaTradeTelemetryBatch(value: unknown): value is NinjaTradeTelemetryBatch {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.kind === "trade_telemetry_batch"
    && isText(payload.batchId)
    && isTimestamp(payload.observedAt)
    && Array.isArray(payload.events)
    && payload.events.length > 0
    && payload.events.length <= maximumEvents
    && payload.events.every(isEvent);
}

/** Drop unrecognized fields, including caller-supplied owner/destination IDs. */
export function normalizeNinjaTradeTelemetryBatch(batch: NinjaTradeTelemetryBatch): NinjaTradeTelemetryBatch {
  return {
    kind: batch.kind, batchId: batch.batchId, observedAt: batch.observedAt,
    events: batch.events.map((event): NinjaTradeTelemetryEvent => {
      const common = {
        eventId: event.eventId, occurredAt: event.occurredAt, accountName: event.accountName,
        connectionName: event.connectionName, providerName: event.providerName,
      };
      if (event.kind === "balance") return {
        ...common, kind: event.kind, cashValue: event.cashValue, netLiquidation: event.netLiquidation,
        totalCashBalance: event.totalCashBalance, realizedProfitLoss: event.realizedProfitLoss,
        unrealizedProfitLoss: event.unrealizedProfitLoss,
      };
      if (event.kind === "position") return {
        ...common, kind: event.kind, instrument: event.instrument, marketPosition: event.marketPosition,
        averagePrice: event.averagePrice, quantity: event.quantity,
      };
      return {
        ...common, kind: event.kind, instrument: event.instrument, marketPosition: event.marketPosition,
        executionId: event.executionId, orderId: event.orderId, orderAction: event.orderAction,
        price: event.price, quantity: event.quantity,
      };
    }),
  };
}

