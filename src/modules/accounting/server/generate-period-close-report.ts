import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPeriodCloseReportSnapshot } from "./load-period-close-report-snapshot";
import { renderPeriodCloseReport } from "./render-period-close-report";

const REPORT_BUCKET = "period-close-reports";

export type PeriodCloseReportGenerationOutcome = Readonly<{
  failed: Array<{ message: string; periodId: string }>;
  generatedPeriodIds: string[];
}>;

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo generar el informe PDF.";
}

export async function ensurePeriodCloseReport(
  db: SupabaseClient,
  periodId: string,
): Promise<{ closureVersionId: string; generated: boolean }> {
  const snapshot = await loadPeriodCloseReportSnapshot(db, periodId);
  const { data: existing, error: existingError } = await db
    .from("period_closure_reports")
    .select("id,report_status")
    .eq("closure_version_id", snapshot.closure.id)
    .maybeSingle();
  if (existingError) throw new Error("No se pudo consultar el estado del informe de cierre.");
  if (existing?.report_status === "ready") {
    return { closureVersionId: snapshot.closure.id, generated: false };
  }

  const { data: report, error: upsertError } = await db
    .from("period_closure_reports")
    .upsert({
      checksum_sha256: null,
      closure_version_id: snapshot.closure.id,
      failure_message: null,
      generated_at: null,
      owner_user_id: snapshot.owner.id,
      period_id: periodId,
      report_status: "generating",
      snapshot_data: snapshot,
      storage_bucket: REPORT_BUCKET,
      storage_path: null,
    }, { onConflict: "closure_version_id" })
    .select("id")
    .single();
  if (upsertError || !report) throw new Error("No se pudo iniciar la generación del informe de cierre.");

  try {
    const pdf = await renderPeriodCloseReport(snapshot);
    const checksum = createHash("sha256").update(pdf).digest("hex");
    const storagePath = `${snapshot.owner.id}/${snapshot.period.month}/${snapshot.closure.id}.pdf`;
    const { error: uploadError } = await db.storage
      .from(REPORT_BUCKET)
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error("No se pudo almacenar el informe PDF.");

    const { error: readyError } = await db
      .from("period_closure_reports")
      .update({
        checksum_sha256: checksum,
        failure_message: null,
        generated_at: new Date().toISOString(),
        report_status: "ready",
        storage_path: storagePath,
      })
      .eq("id", report.id);
    if (readyError) throw new Error("El PDF se creó, pero no pudo marcarse como listo.");
    return { closureVersionId: snapshot.closure.id, generated: true };
  } catch (error) {
    await db
      .from("period_closure_reports")
      .update({ failure_message: failureMessage(error), report_status: "failed" })
      .eq("id", report.id);
    throw error;
  }
}

export async function generatePendingPeriodCloseReports(
  db: SupabaseClient,
  preferredPeriodIds: readonly string[] = [],
): Promise<PeriodCloseReportGenerationOutcome> {
  const [{ data: periods, error: periodsError }, { data: closures, error: closuresError }, { data: reports, error: reportsError }] = await Promise.all([
    db.from("periods").select("id").eq("lifecycle_status", "closed"),
    db.from("period_closure_versions").select("id,period_id,version").order("version", { ascending: false }),
    db.from("period_closure_reports").select("closure_version_id,report_status"),
  ]);
  if (periodsError || closuresError || reportsError) {
    throw new Error("No se pudieron identificar los informes de cierre pendientes.");
  }

  const latestClosureByPeriod = new Map<string, string>();
  for (const closure of closures ?? []) {
    if (!latestClosureByPeriod.has(closure.period_id)) latestClosureByPeriod.set(closure.period_id, closure.id);
  }
  const readyClosures = new Set((reports ?? [])
    .filter((report) => report.report_status === "ready")
    .map((report) => report.closure_version_id));
  const closedPeriodIds = new Set((periods ?? []).map((period) => period.id));
  const candidates = [...new Set([
    ...preferredPeriodIds.filter((periodId) => closedPeriodIds.has(periodId)),
    ...[...closedPeriodIds].filter((periodId) => {
      const closureId = latestClosureByPeriod.get(periodId);
      return closureId && !readyClosures.has(closureId);
    }),
  ])];

  const outcome: { failed: Array<{ message: string; periodId: string }>; generatedPeriodIds: string[] } = {
    failed: [],
    generatedPeriodIds: [],
  };
  for (const periodId of candidates) {
    try {
      const result = await ensurePeriodCloseReport(db, periodId);
      if (result.generated) outcome.generatedPeriodIds.push(periodId);
    } catch (error) {
      outcome.failed.push({ message: failureMessage(error), periodId });
    }
  }
  return outcome;
}
