import type { OperationalSummary } from "./operational-summary";

export type SummaryAlert = Readonly<{
  code:
    | "capital_reconciliation_difference"
    | "gain_reconciliation_difference"
    | "missing_broker_balance"
    | "pending_funding_withdrawal"
    | "manual_account_state";
  detail: string;
  href: "#operaciones" | "#contabilidad";
  severity: "attention" | "information";
  title: string;
}>;

export function buildSummaryAlerts(summary: OperationalSummary): SummaryAlert[] {
  const alerts: SummaryAlert[] = [];

  if (summary.brokerBalanceInCents === null) {
    alerts.push({ code: "missing_broker_balance", detail: "Todavía no hay un saldo de broker registrado para este período.", href: "#operaciones", severity: "attention", title: "Falta informar el saldo de broker" });
  }
  if (summary.positionDifferenceInCents !== 0) {
    alerts.push({ code: "capital_reconciliation_difference", detail: "La posición observable y la posición esperada no coinciden. Revisá los movimientos que integran Contabilidad; la app no ajusta importes automáticamente.", href: "#contabilidad", severity: "attention", title: "Diferencia en la conciliación de capital" });
  }
  if (summary.realizedReconciliationDifferenceInCents !== 0) {
    alerts.push({ code: "gain_reconciliation_difference", detail: "La ganancia de cuentas cerradas no coincide con la reconstrucción del período, flotante y cuentas vírgenes.", href: "#operaciones", severity: "attention", title: "Diferencia en la conciliación de ganancias" });
  }
  const pending = summary.fundingWithdrawals.filter((withdrawal) => !withdrawal.collectedOn);
  if (pending.length > 0) {
    alerts.push({ code: "pending_funding_withdrawal", detail: `${pending.length} payout${pending.length === 1 ? "" : "s"} ${pending.length === 1 ? "sigue" : "siguen"} aprobado${pending.length === 1 ? "" : "s"} y sin cobro confirmado.`, href: "#contabilidad", severity: "information", title: "Payouts pendientes de cobro" });
  }
  if (summary.manualAccountStateCount > 0) {
    alerts.push({ code: "manual_account_state", detail: `${summary.manualAccountStateCount} cuenta${summary.manualAccountStateCount === 1 ? "" : "s"} tiene${summary.manualAccountStateCount === 1 ? "" : "n"} un estado forzado. Es una excepción guardada y conviene revisarla antes del cierre.`, href: "#operaciones", severity: "information", title: "Hay estados de cuenta forzados" });
  }
  return alerts;
}
