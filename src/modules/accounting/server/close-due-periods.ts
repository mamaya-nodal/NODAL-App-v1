import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { generatePendingPeriodCloseReports } from "./generate-period-close-report";

export type PeriodCloseOutcome = Readonly<{
  closedPeriodIds: string[];
  generatedReportPeriodIds: string[];
  failed: Array<{ message: string; periodId: string; stage: "close" | "report" }>;
}>;

export function periodHasObservations(summary: OperationalSummary): boolean {
  return summary.positionDifferenceInCents !== 0
    || summary.brokerBalanceInCents === null
    || summary.resultDetails?.verified === false
    || summary.realizedReconciliationDifferenceInCents !== 0;
}

async function loadCommissionWithService(
  supabase: SupabaseClient,
  userId: string,
  month: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("nodal_user_terms")
    .select("commission_bps")
    .eq("user_id", userId)
    .lte("effective_month", month)
    .order("effective_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("No se pudo fijar el porcentaje de comisión del cierre.");
  return data?.commission_bps === null || data?.commission_bps === undefined
    ? null
    : Number(data.commission_bps);
}

export async function closeDueAccountingPeriods(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<PeriodCloseOutcome> {
  const { data: duePeriods, error } = await supabase
    .from("periods")
    .select("id")
    .eq("lifecycle_status", "open")
    .lte("scheduled_close_at", now.toISOString())
    .order("scheduled_close_at");
  if (error) throw new Error("No se pudieron identificar los períodos pendientes de cierre.");

  const periodIds = (duePeriods ?? []).map((period) => period.id);
  const closedPeriodIds: string[] = [];
  const failed: Array<{ message: string; periodId: string; stage: "close" | "report" }> = [];

  const summaries = periodIds.length > 0
    ? await loadPeriodSummaries(supabase, periodIds, {
        loadCommission: (userId, month) => loadCommissionWithService(supabase, userId, month),
      })
    : new Map();

  for (const periodId of periodIds) {
    const loaded = summaries.get(periodId);
    if (!loaded) {
      failed.push({ message: "No se pudo reconstruir el resumen de cierre.", periodId, stage: "close" });
      continue;
    }
    const { error: closeError } = await supabase.rpc("close_nodal_accounting_period_as_service", {
      target_has_observations: periodHasObservations(loaded.summary),
      target_period_id: periodId,
      target_reason: "Cierre contable automático",
      target_summary: loaded.summary,
    });
    if (closeError) {
      failed.push({ message: closeError.message, periodId, stage: "close" });
      continue;
    }
    closedPeriodIds.push(periodId);
  }

  const reports = await generatePendingPeriodCloseReports(supabase, closedPeriodIds);
  failed.push(...reports.failed.map((failure) => ({ ...failure, stage: "report" as const })));
  return { closedPeriodIds, failed, generatedReportPeriodIds: reports.generatedPeriodIds };
}
