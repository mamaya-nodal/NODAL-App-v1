import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { runAccountingDiagnosticForOwner } from "@/modules/agent/server/run-accounting-diagnostic";

export const maxDuration = 300;
const CONCURRENCY = 5;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const target = `Bearer ${expected ?? ""}`;
  return Boolean(expected) && Buffer.byteLength(supplied) === Buffer.byteLength(target)
    && timingSafeEqual(Buffer.from(supplied), Buffer.from(target));
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (process.env.NODALITO_REPAIRS_ENABLED !== "true") return NextResponse.json({ enabled: false });
  const db = createServiceClient();
  const run = await db.from("nodalito_audit_runs").insert({}).select("id").single();
  if (run.error || !run.data) return NextResponse.json({ message: "No se pudo iniciar la ronda." }, { status: 503 });
  const runId = run.data.id;
  const owners = await db.from("nodal_users").select("id").eq("access_state", "active").limit(1001);
  if (owners.error || (owners.data?.length ?? 0) > 1000) {
    await db.from("nodalito_audit_runs").update({ status: "failed", finished_at: new Date().toISOString(), failures: [{ code: "scope_incomplete" }] }).eq("id", runId);
    return NextResponse.json({ message: "No se pudo completar el alcance de la ronda.", runId }, { status: 503 });
  }

  let reviewed = 0;
  let failures = 0;
  let critical = 0;
  let attention = 0;
  let informational = 0;
  let cases = 0;
  const failureDetail: Array<{ ownerId: string; code: string }> = [];
  const targets = owners.data ?? [];

  for (let offset = 0; offset < targets.length; offset += CONCURRENCY) {
    await Promise.all(targets.slice(offset, offset + CONCURRENCY).map(async (owner) => {
      try {
        const findings = await runAccountingDiagnosticForOwner(db, owner.id);
        critical += findings.filter((finding) => finding.severity === "critical").length;
        attention += findings.filter((finding) => finding.severity === "attention").length;
        informational += findings.filter((finding) => finding.severity === "info").length;
        const actionable = findings.filter((finding) => finding.severity !== "info");
        for (const finding of actionable) {
          const result = await db.rpc("record_nodalito_audit_finding", {
            target_owner: owner.id,
            finding_key: finding.id,
            finding_title: finding.title,
            finding_description: finding.detail,
            finding_evidence: { source: "deterministic_audit", runId, evidence: finding.evidence },
            finding_priority: finding.severity === "critical" ? "critical" : "high",
          });
          if (result.error) throw result.error;
          cases++;
        }
        const resolved = await db.rpc("resolve_nodalito_audit_findings", {
          target_owner: owner.id,
          active_keys: actionable.map((finding) => finding.id),
          audit_run: runId,
        });
        if (resolved.error) throw resolved.error;
        reviewed++;
      } catch (error) {
        failures++;
        const code = error instanceof Error ? error.message.slice(0, 160) : "unknown_failure";
        failureDetail.push({ ownerId: owner.id, code });
      }
    }));
  }

  const status = failures === 0 ? "completed" : reviewed > 0 ? "partial" : "failed";
  const finish = await db.from("nodalito_audit_runs").update({
    attention_count: attention,
    critical_count: critical,
    failed_count: failures,
    failures: failureDetail,
    finished_at: new Date().toISOString(),
    informational_count: informational,
    opened_case_count: cases,
    reviewed_count: reviewed,
    status,
    target_count: targets.length,
  }).eq("id", runId);
  if (finish.error) return NextResponse.json({ message: "La ronda terminó, pero no se pudo guardar el resumen.", runId }, { status: 503 });
  return NextResponse.json({ runId, reviewed, failures, critical, attention, informational, cases, complete: failures === 0 }, { status: failures ? 503 : 200 });
}
