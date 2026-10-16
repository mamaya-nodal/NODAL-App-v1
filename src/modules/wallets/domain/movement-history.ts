import type { WalletMovement } from "@/modules/summary/domain/operational-summary";

export function orderWalletMovementHistory(
  movements: readonly WalletMovement[],
): WalletMovement[] {
  return [...movements].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn)
    || (right.createdAt ?? "").localeCompare(left.createdAt ?? "")
    || right.id.localeCompare(left.id),
  );
}

function csvValue(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function buildWalletMovementHistoryCsv(input: Readonly<{
  labels: Readonly<Record<string, string>>;
  movements: readonly WalletMovement[];
  walletNames: Readonly<Record<string, string>>;
}>): string {
  const rows = orderWalletMovementHistory(input.movements).map((movement) => [
    movement.occurredOn,
    movement.periodLabel ?? "",
    movement.createdAt ?? "",
    input.walletNames[movement.walletId ?? ""] ?? "Billetera",
    movement.destinationWalletId
      ? input.walletNames[movement.destinationWalletId] ?? "Billetera"
      : "",
    input.labels[movement.kind] ?? "Movimiento de billetera",
    (movement.amountInCents / 100).toFixed(2),
    ((movement.feeInCents ?? 0) / 100).toFixed(2),
    movement.observation ?? "",
    movement.dailyControlId ? "Conciliación automática" : "Carga manual",
    movement.id,
  ]);

  return [
    ["Fecha", "Período", "Registrado", "Billetera origen", "Billetera destino", "Tipo", "Importe USD", "Fee USD", "Observación", "Origen", "ID"],
    ...rows,
  ].map((row) => row.map(csvValue).join(",")).join("\r\n");
}
