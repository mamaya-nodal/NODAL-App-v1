export type PeriodActivityAction =
  | "purchase_created"
  | "daily_control_confirmed"
  | "daily_control_confirmed_custom_allocation"
  | "daily_control_balance_corrected"
  | "daily_control_balance_corrected_with_allocations";

export type PeriodActivityRow = Readonly<{
  accountReference: number | null;
  action: PeriodActivityAction;
  auditEventId: number;
  balanceAfterInCents: number | null;
  companyName: string | null;
  controlKind: "deposit" | "withdrawal" | "balance_update" | null;
  controlNumber: number | null;
  fundsOrigin: string | null;
  occurredAt: string;
  operatedOn: string | null;
  phase: string | null;
  primaryAmountInCents: number | null;
  purchaseNumber: number | null;
  reason: string | null;
}>;

export type PeriodActivityItem = Readonly<{
  amountInCents: number | null;
  balanceAfterInCents: number | null;
  correction: boolean;
  id: number;
  occurredAt: string;
  operatedOn: string | null;
  reason: string | null;
  reference: string;
  subtitle: string;
  title: string;
}>;

function accountLabel(row: PeriodActivityRow): string {
  if (!row.companyName || row.accountReference === null) return "Cuenta no disponible";
  return `${row.companyName} · Cuenta ${row.accountReference}`;
}

export function buildPeriodActivityItem(
  row: PeriodActivityRow,
): PeriodActivityItem {
  if (row.action === "purchase_created") {
    return {
      amountInCents: row.primaryAmountInCents,
      balanceAfterInCents: null,
      correction: false,
      id: row.auditEventId,
      occurredAt: row.occurredAt,
      operatedOn: row.operatedOn,
      reason: null,
      reference: `Compra ${row.purchaseNumber ?? "—"}`,
      subtitle: `${accountLabel(row)}${row.fundsOrigin ? ` · ${row.fundsOrigin}` : ""}`,
      title: "Compra registrada",
    };
  }

  const reference = `Control Diario ${row.controlNumber ?? "—"}`;
  if (
    row.action === "daily_control_balance_corrected" ||
    row.action === "daily_control_balance_corrected_with_allocations"
  ) {
    return {
      amountInCents: null,
      balanceAfterInCents: null,
      correction: true,
      id: row.auditEventId,
      occurredAt: row.occurredAt,
      operatedOn: row.operatedOn,
      reason: row.reason,
      reference,
      subtitle:
        row.action === "daily_control_balance_corrected_with_allocations"
          ? "Saldo y distribución por cuenta recalculados"
          : "Saldo y registros derivados recalculados",
      title: "Saldo broker corregido",
    };
  }

  const customAllocation =
    row.action === "daily_control_confirmed_custom_allocation";
  const titles = {
    balance_update: customAllocation
      ? "Saldo broker confirmado con distribución ajustada"
      : "Saldo broker confirmado",
    deposit: "Depósito registrado",
    withdrawal: "Retiro registrado",
  } as const;

  return {
    amountInCents: row.primaryAmountInCents,
    balanceAfterInCents: row.balanceAfterInCents,
    correction: false,
    id: row.auditEventId,
    occurredAt: row.occurredAt,
    operatedOn: row.operatedOn,
    reason: customAllocation ? row.reason : null,
    reference,
    subtitle:
      row.controlKind === "balance_update"
        ? `${accountLabel(row)}${row.phase ? ` · ${row.phase}` : ""}`
        : "Movimiento de capital, sin resultado operativo",
    title: row.controlKind ? titles[row.controlKind] : "Control Diario confirmado",
  };
}

export function buildPeriodActivity(
  rows: PeriodActivityRow[],
): PeriodActivityItem[] {
  return rows.map(buildPeriodActivityItem);
}

