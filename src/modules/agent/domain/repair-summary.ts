const labels: Record<string, string> = {
  external_account_name: "Cuenta", connection_name: "Conexión", funds_origin: "Origen del pago",
  price_cents: "Precio de compra", amount_cents: "Importe", fee_cents: "Comisión",
  balance_cents: "Saldo broker", balance_before_cents: "Saldo anterior",
  approved_on: "Aprobación", collected_on: "Cobro", occurred_on: "Fecha", operated_on: "Operación", purchased_on: "Compra",
  phase: "Etapa", completed_days: "Días completados", reason: "Motivo", evidence_note: "Datos confirmados",
};
export function repairSummary(parameters: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    if (key === "account_ids" && Array.isArray(value)) lines.push(`Cuentas participantes: ${value.length}`);
    else if (key === "close_accounts") lines.push(value ? "Se cerrarán las cuentas seleccionadas" : "Las cuentas conservarán su estado operativo");
    else if (key === "kind") lines.push(({ external_contribution: "Aporte nuevo del trader", personal_withdrawal: "Retiro personal", contribution_refund: "Devolución de aporte", broker_to_wallet: "Transferencia del broker a la billetera", wallet_to_broker: "Transferencia de la billetera al broker" } as Record<string, string>)[String(value)] ?? "Movimiento de saldo");
    else if (labels[key]) lines.push(`${labels[key]}: ${key.endsWith("_cents") && typeof value === "number" ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(value / 100) : String(value)}`);
  }
  return lines;
}

/** Only public accounting fields are shown; never render arbitrary database columns. */
export function repairChanges(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const fields: Record<string, string> = { funds_origin: "Origen del pago", balance_after_cents: "Saldo broker", operating_result_cents: "Resultado de operación", completed_trade_days: "Días previos a los registros", accounting_phase: "Etapa de la cuenta", collected_on: "Fecha de cobro", total_withdrawal_cents: "Payout aplicado al ciclo", state: "Estado de cuenta" };
  const display = (key: string, value: unknown) => value === null || value === undefined ? "sin registrar" : key.endsWith("_cents") && typeof value === "number" ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(value / 100) : ({ virgin: "Sin operar", live: "Activa", closed: "Cerrada", burned: "Quemada" } as Record<string, string>)[String(value)] ?? String(value);
  const changes: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { before, after } = item as { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null };
    for (const [key,label] of Object.entries(fields)) {
      if (before?.[key] === after?.[key] || (!Object.hasOwn(before ?? {},key) && !Object.hasOwn(after ?? {},key))) continue;
      changes.push(`${label}: ${display(key,before?.[key])} → ${display(key,after?.[key])}`);
    }
  }
  return [...new Set(changes)].slice(0, 24);
}
