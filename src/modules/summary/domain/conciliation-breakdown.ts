import type { OperationalSummary } from "./operational-summary";

export type ConciliationLine = Readonly<{
  href: "#control-diario" | "#registro" | "#resumen";
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
        { href: "#control-diario", label: "Saldo broker", valueInCents: summary.brokerBalanceInCents },
        { href: "#resumen", label: "Saldo billetera", valueInCents: summary.walletBalanceInCents },
        { href: "#resumen", label: "Retiros pendientes", valueInCents: summary.fundingPendingInCents },
      ],
      expected: [
        { href: "#resumen", label: "Capital neto aportado", valueInCents: summary.capitalNetInCents },
        { href: "#control-diario", label: "Resultado del período", valueInCents: summary.periodResultInCents },
      ],
    },
    gains: {
      closedInCents: summary.realizedGainInCents,
      differenceInCents: summary.realizedReconciliationDifferenceInCents,
      reconstructed: [
        { href: "#control-diario", label: "Resultado del período", valueInCents: summary.periodResultInCents },
        { href: "#registro", label: "Flotante de cuentas vivas", valueInCents: summary.floatingInCents },
        { href: "#registro", label: "Precio de cuentas vírgenes", valueInCents: summary.virginPriceInCents },
      ],
    },
  };
}
