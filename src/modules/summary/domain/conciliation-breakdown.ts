import type { OperationalSummary } from "./operational-summary";

export type ConciliationLine = Readonly<{
  href: "#operaciones" | "#contabilidad";
  label: string;
  valueInCents: number | null;
}>;

export type ConciliationBreakdown = Readonly<{
  capital: Readonly<{
    differenceInCents: number;
    expected: ConciliationLine[];
    observable: ConciliationLine[];
  }>;
  gains: Readonly<{
    closedInCents: number;
    differenceInCents: number;
    reconstructed: ConciliationLine[];
  }>;
}>;

export function buildConciliationBreakdown(summary: OperationalSummary): ConciliationBreakdown {
  return {
    capital: {
      differenceInCents: summary.positionDifferenceInCents,
      observable: [
        { href: "#operaciones", label: "Saldo broker", valueInCents: summary.brokerBalanceInCents },
        { href: "#contabilidad", label: "Saldo billetera", valueInCents: summary.walletBalanceInCents },
        { href: "#contabilidad", label: "Retiros pendientes", valueInCents: summary.fundingPendingInCents },
      ],
      expected: [
        { href: "#contabilidad", label: "Capital neto aportado", valueInCents: summary.capitalNetInCents },
        { href: "#operaciones", label: "Resultado acumulado", valueInCents: summary.accumulatedResultInCents },
      ],
    },
    gains: {
      closedInCents: summary.realizedGainInCents,
      differenceInCents: summary.realizedReconciliationDifferenceInCents,
      reconstructed: [
        { href: "#operaciones", label: "Resultado del período", valueInCents: summary.periodResultInCents },
        { href: "#operaciones", label: "Flotante de cuentas vivas", valueInCents: summary.floatingInCents },
        { href: "#operaciones", label: "Precio de cuentas vírgenes", valueInCents: summary.virginPriceInCents },
      ],
    },
  };
}
