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

  return `/app?${params.toString()}`;
}

export async function createPurchase(formData: FormData): Promise<never> {
  const mode = formText(formData, "mode");
  const period = formText(formData, "period");
  const periodId = formText(formData, "period_id");
  const companyId = formText(formData, "company_id");
  const fundsOrigin = formText(formData, "funds_origin");
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

  const { error } = await supabase.rpc("create_nodal_purchase", {
    target_company_id: companyId,
    target_funds_origin: fundsOrigin,
    target_period_id: periodId,
    target_price_cents: priceCents,
  });

  if (error) {
    const result = error.message.includes("selected current month")
      ? "period_not_current"
      : "not_created";
    redirect(safeContextUrl(mode, period, result));
  }

  revalidatePath("/app");
  redirect(safeContextUrl(mode, period, "created"));
}
