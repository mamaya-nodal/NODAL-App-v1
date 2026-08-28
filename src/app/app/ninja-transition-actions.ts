"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parsePurchasePriceToCents } from "@/modules/purchases/domain/purchase-rules";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
function url(formData: FormData, result: string) {
  const params = new URLSearchParams({ mode: text(formData, "mode") === "practice" ? "practice" : "real", transition_result: result });
  const period = text(formData, "period");
  if (/^\d{4}-\d{2}-01$/.test(period)) params.set("period", period);
  return `/app?${params.toString()}#inicio`;
}
export async function resolveNinjaTransition(formData: FormData): Promise<never> {
  const eventId = text(formData, "event_id");
  const resolution = text(formData, "resolution");
  if (!eventId || !["confirm_transition", "confirm_closed", "dismiss"].includes(resolution)) redirect(url(formData, "invalid"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { error } = await supabase.rpc("resolve_ninja_account_change_event", {
    management_reason: resolution === "dismiss" ? "El usuario indicó que el cambio no corresponde" : "Cambio de cuenta confirmado por el usuario",
    target_event_id: eventId,
    target_resolution: resolution,
  });
  if (error) redirect(url(formData, "failed"));
  revalidatePath("/app");
  redirect(url(formData, resolution === "dismiss" ? "dismissed" : "confirmed"));
}

export async function registerNinjaReset(formData: FormData): Promise<never> {
  const purchasedOn = text(formData, "purchased_on");
  const fundsOrigin = text(formData, "funds_origin");
  let priceInCents: number;
  try {
    priceInCents = parsePurchasePriceToCents(text(formData, "price"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn) || !["Aporte trader", "Saldo generado"].includes(fundsOrigin)) throw new Error();
  } catch { redirect(url(formData, "invalid")); }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { error } = await supabase.rpc("register_ninja_reset_purchase", {
    target_event_id: text(formData, "event_id"),
    target_funds_origin: fundsOrigin,
    target_period_id: text(formData, "period_id"),
    target_price_cents: priceInCents,
    target_purchased_on: purchasedOn,
  });
  if (error) redirect(url(formData, "failed"));
  revalidatePath("/app");
  redirect(url(formData, "reset_registered"));
}
