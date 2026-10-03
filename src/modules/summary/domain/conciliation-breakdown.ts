import type { OperationalSummary } from "./operational-summary";

export type ConciliationLine = Readonly<{
  href: "#operaciones" | "#contabilidad" | "#cuentas";
  label: string;
  valueInCents: number | null;
}>;

const line = (label: string, valueInCents: number | null, href: ConciliationLine["href"] = "#contabilidad"): ConciliationLine => ({ label, valueInCents: valueInCents === 0 ? 0 : valueInCents, href });
// An unavailable component is not a zero and cannot produce a verified total.
export function sumConciliationLines(lines: readonly ConciliationLine[]): number | null {
  return lines.some((item) => item.valueInCents === null) ? null
    : lines.reduce((total, item) => total + item.valueInCents!, 0);
}

export function buildConciliationBreakdown(summary: OperationalSummary) {
  const detail = summary.resultDetails;
  const ledger = [
    line("Resultado broker", detail?.brokerResultInCents ?? null, "#operaciones"),
    line("Compras de cuentas", detail ? -detail.purchasesInCents : null, "#cuentas"),
    line("Payouts aprobados", detail?.approvedPayoutsInCents ?? null),
    line("Gastos de transferencias y cobros", detail ? -detail.feesInCents : null),
  ];
  const reconstructed = [
    line("Resultado de cuentas cerradas", summary.realizedGainInCents, "#cuentas"),
    line("Variación del resultado de cuentas vivas", detail ? detail.liveResultInCents - detail.openingLiveResultInCents : null, "#cuentas"),
    line("Variación del costo de cuentas vírgenes", detail ? detail.openingVirginPriceInCents - summary.virginPriceInCents : null, "#cuentas"),
    line("Resultado broker sin cobertura", summary.uncoveredBrokerResultInCents ?? 0, "#operaciones"),
    line("Gastos de transferencias y cobros", detail ? -detail.feesInCents : null),
  ];
  const ledgerTotal = sumConciliationLines(ledger);
  const reconstructedTotal = sumConciliationLines(reconstructed);
  const accumulated = detail?.accumulatedBreakdownAvailable ? [
    line("Resultado histórico de cuentas cerradas", detail.accumulatedClosedResultInCents, "#cuentas"),
    line("Resultado actual de cuentas vivas (flotante)", detail.liveResultInCents, "#cuentas"),
    line("Costo de cuentas vírgenes", -summary.virginPriceInCents, "#cuentas"),
    line("Resultado histórico broker sin cobertura", detail.accumulatedUncoveredResultInCents, "#operaciones"),
    line("Gastos históricos de transferencias y cobros", -detail.accumulatedFeesInCents),
    line("Rectificaciones aprobadas", detail.accumulatedAdjustmentsInCents ?? 0),
  ] : [
    line("Resultado acumulado al inicio", detail?.openingAccumulatedResultInCents ?? null),
    line("Resultado del período", summary.periodResultInCents),
    line("Rectificaciones aprobadas del período", summary.priorPeriodResultAdjustmentInCents ?? 0),
  ];
  return {
    capital: {
      verified: summary.brokerBalanceInCents !== null && detail?.verified !== false,
      differenceInCents: summary.positionDifferenceInCents,
      observable: [
        line("Saldo broker contable", summary.brokerBalanceInCents, "#operaciones"),
        line("Saldo billeteras", summary.walletBalanceInCents),
        line("Payouts pendientes", summary.fundingPendingInCents),
      ],
      expected: [line("Capital neto aportado", summary.capitalNetInCents), line("Resultado acumulado", summary.accumulatedResultInCents)],
    },
    gains: {
      verified: detail?.verified === true && ledgerTotal === summary.periodResultInCents,
      ledger, ledgerTotal, reconstructed, reconstructedTotal,
      differenceInCents: reconstructedTotal === null ? null : reconstructedTotal - summary.periodResultInCents,
    },
    accumulated: {
      lines: accumulated,
      total: sumConciliationLines(accumulated),
      complete: detail?.accumulatedBreakdownAvailable === true,
    },
  };
}
