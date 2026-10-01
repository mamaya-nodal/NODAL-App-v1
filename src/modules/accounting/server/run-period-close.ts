import type { SupabaseClient } from "@supabase/supabase-js";

import { closeDueAccountingPeriods, type PeriodCloseOutcome } from "./close-due-periods";

type TriggerSource = "manual" | "scheduled";

export async function runAccountingPeriodClose(
  supabase: SupabaseClient,
  triggerSource: TriggerSource,
  requestedBy: string | null = null,
): Promise<PeriodCloseOutcome> {
  const { data: run, error: startError } = await supabase
    .from("accounting_period_close_runs")
    .insert({ requested_by: requestedBy, trigger_source: triggerSource })
    .select("id")
    .single();

  if (startError || !run) throw new Error("No se pudo iniciar el control del cierre contable.");

  try {
    const outcome = await closeDueAccountingPeriods(supabase);
    const dueCount = outcome.closedPeriodIds.length + outcome.failed.length;
    const status = outcome.failed.length === 0
      ? "succeeded"
      : outcome.closedPeriodIds.length > 0
        ? "partial"
        : "failed";
    const { error: finishError } = await supabase
      .from("accounting_period_close_runs")
      .update({
        closed_period_count: outcome.closedPeriodIds.length,
        completed_at: new Date().toISOString(),
        due_period_count: dueCount,
        failures: outcome.failed,
        status,
      })
      .eq("id", run.id);
    if (finishError) throw new Error("El cierre terminó, pero no pudo guardarse su control operativo.");
    return outcome;
  } catch (error) {
    await supabase
      .from("accounting_period_close_runs")
      .update({
        completed_at: new Date().toISOString(),
        failures: [{ message: error instanceof Error ? error.message : "Error inesperado" }],
        status: "failed",
      })
      .eq("id", run.id);
    throw error;
  }
}

