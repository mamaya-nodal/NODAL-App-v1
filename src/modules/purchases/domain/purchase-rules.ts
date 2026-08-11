export const PURCHASE_FUNDS_ORIGINS = [
  "Aporte trader",
  "Saldo generado",
] as const;

export type PurchaseFundsOrigin = (typeof PURCHASE_FUNDS_ORIGINS)[number];

export const INITIAL_ACCOUNT_STATE = "Cuenta virgen" as const;

export type PurchaseDraft = Readonly<{
  companyId: string;
  fundsOrigin: string;
  priceCents: number;
}>;

export function isPurchaseFundsOrigin(value: string): value is PurchaseFundsOrigin {
  return PURCHASE_FUNDS_ORIGINS.some((origin) => origin === value);
}

export function validatePurchaseDraft(draft: PurchaseDraft): void {
  if (!draft.companyId.trim()) {
    throw new Error("La empresa es obligatoria.");
  }

  if (!Number.isSafeInteger(draft.priceCents) || draft.priceCents < 0) {
    throw new Error("El precio debe expresarse en centavos enteros no negativos.");
  }

  if (!isPurchaseFundsOrigin(draft.fundsOrigin)) {
    throw new Error("El origen de fondos no pertenece a la lista vigente.");
  }
}

export function nextConsecutive(existingRowsInScope: number): number {
  if (!Number.isSafeInteger(existingRowsInScope) || existingRowsInScope < 0) {
    throw new Error("La cantidad existente debe ser un entero no negativo.");
  }

  return existingRowsInScope + 1;
}
