"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { persistAutomaticOperationBatches } from "@/modules/ninja/server/automatic-operation-processing";

import { createClient } from "@/lib/supabase/server";
import {
  isPurchaseFundsOrigin,
  parsePurchasePriceToCents,
  validatePurchaseDraft,
} from "@/modules/purchases/domain/purchase-rules";

type ActionResult = Readonly<{ ok: boolean; message: string }>;

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function safeContextUrl(mode: string, period: string, result: string): string {
  const params = new URLSearchParams({
    mode: mode === "practice" ? "practice" : "real",
    purchase_result: result,
  });

  if (/^\d{4}-\d{2}-01$/.test(period)) {
    params.set("period", period);
  }

  return `/app?${params.toString()}#cuentas`;
}

export async function createPurchase(formData: FormData): Promise<never> {
  const mode = formText(formData, "mode");
  const period = formText(formData, "period");
  const periodId = formText(formData, "period_id");
  const companyId = formText(formData, "company_id");
  const fundsOrigin = formText(formData, "funds_origin");
  const walletId = formText(formData, "wallet_id") || null;
  let priceCents: number;

  try {
    priceCents = parsePurchasePriceToCents(formText(formData, "price"));
    validatePurchaseDraft({ companyId, fundsOrigin, priceCents });
  } catch {
    redirect(safeContextUrl(mode, period, "invalid_data"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  if (fundsOrigin === "Saldo generado") {
    if (!walletId) redirect(safeContextUrl(mode, period, "wallet_required"));
    const { data: walletBalance, error: walletError } = await supabase.rpc(
      "calculate_nodal_wallet_balance",
      { target_wallet_id: walletId },
    );
    if (walletError || walletBalance === null) {
      redirect(safeContextUrl(mode, period, "wallet_not_available"));
    }
    if (Number(walletBalance) < priceCents) {
      redirect(safeContextUrl(mode, period, "wallet_insufficient"));
    }
  }

  const { error } = await supabase.rpc("create_nodal_purchase_with_wallet", {
    target_company_id: companyId,
    target_funds_origin: fundsOrigin,
    target_period_id: periodId,
    target_price_cents: priceCents,
    target_wallet_id: walletId,
  });

  if (error) {
    const result = error.message.includes("insufficient")
      ? "wallet_insufficient"
      : error.message.includes("Wallet is required")
        ? "wallet_required"
        : error.message.includes("Wallet is not available")
          ? "wallet_not_available"
          : error.message.includes("selected current month")
            ? "period_not_current"
            : "not_created";
    redirect(safeContextUrl(mode, period, result));
  }

  revalidatePath("/app");
  redirect(safeContextUrl(mode, period, "created"));
}

export async function createDetectedPurchase(formData: FormData): Promise<never> {
  const mode = formText(formData, "mode");
  const period = formText(formData, "period");
  const periodId = formText(formData, "period_id");
  const companyId = formText(formData, "company_id");
  const fundsOrigin = formText(formData, "funds_origin");
  const walletId = formText(formData, "wallet_id") || null;
  const purchasedOn = formText(formData, "purchased_on");
  const connectorId = formText(formData, "connector_id");
  const firstSeenAt = formText(formData, "first_seen_at");
  let priceCents: number;

  try {
    priceCents = parsePurchasePriceToCents(formText(formData, "price"));
    validatePurchaseDraft({ companyId, fundsOrigin, priceCents });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn) || Number.isNaN(Date.parse(firstSeenAt))) throw new Error();
  } catch {
    redirect(safeContextUrl(mode, period, "invalid_data"));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  if (fundsOrigin === "Saldo generado") {
    if (!walletId) redirect(safeContextUrl(mode, period, "wallet_required"));
    const { data: walletBalance, error: walletError } = await supabase.rpc(
      "calculate_nodal_wallet_balance",
      { target_wallet_id: walletId },
    );
    if (walletError || walletBalance === null) {
      redirect(safeContextUrl(mode, period, "wallet_not_available"));
    }
    if (Number(walletBalance) < priceCents) {
      redirect(safeContextUrl(mode, period, "wallet_insufficient"));
    }
  }

  const { error } = await supabase.rpc("create_nodal_detected_purchase_with_wallet", {
    target_company_id: companyId,
    target_connection_name: formText(formData, "connection_name"),
    target_external_account_name: formText(formData, "external_account_name"),
    target_first_seen_at: firstSeenAt,
    target_funds_origin: fundsOrigin,
    target_connector_id: connectorId,
    target_period_id: periodId,
    target_price_cents: priceCents,
    target_purchased_on: purchasedOn,
    target_wallet_id: walletId,
  });

  if (error) {
    const result = error.message.includes("already linked")
      ? "already_created"
      : error.message.includes("insufficient")
        ? "wallet_insufficient"
        : error.message.includes("Wallet is required")
          ? "wallet_required"
          : error.message.includes("Wallet is not available")
            ? "wallet_not_available"
            : "not_created";
    redirect(safeContextUrl(mode, period, result));
  }

  // The purchase RPC already verified connector ownership. Revisit stored trades
  // even when Ninja is no longer sending and the browser was closed during trading.
  after(async () => {
    try {
      await persistAutomaticOperationBatches(connectorId);
    } catch {
      console.warn("Ninja post-registration reconciliation deferred");
    }
  });
  revalidatePath("/app");
  redirect(safeContextUrl(mode, period, "created"));
}

export async function updateRegisteredAccountPurchase(input: Readonly<{
  accountId: string;
  fundsOrigin: string;
  price: string;
  walletId: string | null;
}>): Promise<ActionResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.accountId)) {
    return { ok: false, message: "La cuenta no es válida." };
  }
  let priceCents: number;
  try {
    priceCents = parsePurchasePriceToCents(input.price);
  } catch {
    return { ok: false, message: "Ingresá un costo válido con hasta dos decimales." };
  }
  if (!isPurchaseFundsOrigin(input.fundsOrigin)) {
    return { ok: false, message: "Elegí un origen de fondos válido." };
  }
  const walletId = input.fundsOrigin === "Saldo generado" ? input.walletId : null;
  if (input.fundsOrigin === "Saldo generado" && !walletId) {
    return { ok: false, message: "Elegí la billetera utilizada para la compra." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("update_nodal_unused_account_purchase", {
    target_account_id: input.accountId,
    target_funds_origin: input.fundsOrigin,
    target_price_cents: priceCents,
    target_wallet_id: walletId,
  });
  if (error) {
    if (error.message.includes("unused_account_purchase_has_activity")) {
      return { ok: false, message: "Ya no puede modificarse porque la cuenta registra actividad." };
    }
    if (error.message.includes("unused_account_purchase_wallet_insufficient")) {
      return { ok: false, message: "La billetera elegida no tiene saldo suficiente." };
    }
    if (error.message.includes("wallet_required") || error.message.includes("wallet_not_available")) {
      return { ok: false, message: "Elegí una billetera disponible." };
    }
    return { ok: false, message: "No se pudo modificar el registro de la cuenta." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Registro actualizado." };
}

export async function deleteRegisteredAccount(accountId: string): Promise<ActionResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(accountId)) return { ok: false, message: "La cuenta no es válida." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("delete_nodal_registered_account", {
    management_reason: "Registro de cuenta eliminado por el usuario antes de tener actividad",
    target_account_id: accountId,
  });
  if (error) {
    if (error.message.includes("registered_account_has_activity")) {
      return { ok: false, message: "No puede eliminarse porque ya tiene operaciones, coberturas, saldos o payouts registrados." };
    }
    if (error.message.includes("registered_account_state_not_deletable")) {
      return { ok: false, message: "Solo puede eliminarse una cuenta virgen o cerrada que no tenga actividad." };
    }
    return { ok: false, message: "No se pudo eliminar el registro de la cuenta." };
  }
  revalidatePath("/app");
  return { ok: true, message: "Registro eliminado." };
}
