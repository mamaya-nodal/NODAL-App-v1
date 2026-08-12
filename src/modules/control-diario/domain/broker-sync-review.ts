import { calculateDailyBalance } from "./balance-rules";

export type BrokerBalanceReview = Readonly<{
  correctedBalanceInCents: number | null;
  correctionReason: string | null;
  operatingResultInCents: number;
  receivedBalanceInCents: number;
}>;

export function assertCanReceiveBrokerBalance(
  pendingReview: BrokerBalanceReview | null,
): void {
  if (pendingReview) {
    throw new Error("Primero resolvé el saldo recibido de NinjaTrader.");
  }
}

export function createBrokerBalanceReview(
  confirmedBalanceInCents: number | null,
  receivedBalanceInCents: number,
): BrokerBalanceReview {
  const result = calculateDailyBalance(confirmedBalanceInCents, {
    balanceInCents: receivedBalanceInCents,
    kind: "balance_update",
  });

  return {
    correctedBalanceInCents: null,
    correctionReason: null,
    operatingResultInCents: result.operatingResultInCents ?? 0,
    receivedBalanceInCents,
  };
}

export function correctBrokerBalanceReview(
  review: BrokerBalanceReview,
  confirmedBalanceInCents: number | null,
  correctedBalanceInCents: number,
  correctionReason: string,
): BrokerBalanceReview {
  if (!correctionReason.trim()) {
    throw new Error("La contingencia debe indicar un motivo.");
  }

  const result = calculateDailyBalance(confirmedBalanceInCents, {
    balanceInCents: correctedBalanceInCents,
    kind: "balance_update",
  });

  return {
    ...review,
    correctedBalanceInCents,
    correctionReason: correctionReason.trim(),
    operatingResultInCents: result.operatingResultInCents ?? 0,
  };
}

export function effectiveBrokerBalance(review: BrokerBalanceReview): number {
  return review.correctedBalanceInCents ?? review.receivedBalanceInCents;
}
