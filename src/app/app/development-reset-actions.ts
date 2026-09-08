"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function safeResetUrl(mode: string, period: string, result: string): string {
  const params = new URLSearchParams({
    mode: mode === "practice" ? "practice" : "real",
    reset_result: result,
  });
  if (/^\d{4}-\d{2}-01$/.test(period)) params.set("period", period);
  return `/app?${params.toString()}#cuentas`;
}

/** Borra solo datos transitorios del período propio mientras se prueba localmente. */
export async function resetDevelopmentPeriod(formData: FormData): Promise<never> {
  const mode = formText(formData, "mode");
  const period = formText(formData, "period");
  const periodId = formText(formData, "period_id");
  const confirmation = formText(formData, "confirmation");

  if (process.env.NODE_ENV !== "development") {
    redirect(safeResetUrl(mode, period, "unavailable"));
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(periodId)) {
    redirect(safeResetUrl(mode, period, "invalid"));
  }
  if (confirmation !== "REINICIAR") {
    redirect(safeResetUrl(mode, period, "confirmation_required"));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase.rpc("reset_nodal_development_period", {
    target_period_id: periodId,
  });
  if (error) redirect(safeResetUrl(mode, period, "not_reset"));

  revalidatePath("/app");
  redirect(safeResetUrl(mode, period, "completed"));
}
