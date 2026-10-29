import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";

export type OpeningBrokerPresentation = Readonly<{
  detail: string;
  value: string;
}>;

export function openingBrokerPresentation(
  liveBrokerBalance: NinjaLiveBrokerBalance | null,
  pendingAccountCount: number,
  formatMoney: (value: number) => string,
): OpeningBrokerPresentation {
  if (liveBrokerBalance) {
    return {
      detail: "Se toma automáticamente del conector y no se edita aquí.",
      value: formatMoney(liveBrokerBalance.balanceInCents / 100),
    };
  }
  if (pendingAccountCount > 0) {
    return {
      detail: "Confirmá debajo cuál de las cuentas detectadas te pertenece.",
      value: "Pendiente de confirmar",
    };
  }
  return {
    detail: "Ninja todavía no informó una cuenta broker para esta apertura.",
    value: "Sin cuenta broker detectada",
  };
}
