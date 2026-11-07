import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { runAccountingDiagnosticForOwner } from "@/modules/agent/server/run-accounting-diagnostic";

export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const target = `Bearer ${expected ?? ""}`;
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(target) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(target))) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (process.env.NODALITO_REPAIRS_ENABLED !== "true") return NextResponse.json({ enabled: false });
  const db = createServiceClient();
  const owners = await db.from("nodalito_repair_access").select("user_id").eq("enabled", true).limit(101);
  if (owners.error || (owners.data?.length ?? 0) > 100) return NextResponse.json({ message: "No se pudo completar el alcance de la ronda." }, { status: 503 });
  let reviewed = 0;
  let failures = 0;
  for (const owner of owners.data ?? []) {
    try {
      const findings = await runAccountingDiagnosticForOwner(db, owner.user_id);
      for (const finding of findings.filter((f) => f.severity !== "info")) {
        const result = await db.rpc("record_nodalito_audit_finding", { target_owner: owner.user_id, finding_key: finding.id, finding_title: finding.title, finding_description: finding.detail, finding_evidence: { source: "deterministic_audit", evidence: finding.evidence }, finding_priority: finding.severity === "critical" ? "high" : "normal" });
        if (result.error) throw result.error;
      }
      reviewed++;
    } catch { failures++; }
  }
  return NextResponse.json({ reviewed, failures, complete: failures === 0 }, { status: failures ? 503 : 200 });
}
