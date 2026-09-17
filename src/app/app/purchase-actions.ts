"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  parsePurchasePriceToCents,
  validatePurchaseDraft,
} from "@/modules/purchases/domain/purchase-rules";

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
    target_connector_id: formText(formData, "connector_id"),
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

  revalidatePath("/app");
  redirect(safeContextUrl(mode, period, "created"));
}

export async function deleteManualAccount(accountId: string): Promise<Readonly<{ ok: boolean; message: string }>> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(accountId)) return { ok: false, message: "La cuenta no es válida." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("delete_nodal_manual_account", { target_account_id: accountId });
  if (error) return { ok: false, message: error.message.includes("unused manual") ? "Solo puede eliminarse una cuenta manual virgen y sin actividad." : "No se pudo eliminar la cuenta." };
  revalidatePath("/app");
  return { ok: true, message: "Cuenta manual eliminada." };
}
