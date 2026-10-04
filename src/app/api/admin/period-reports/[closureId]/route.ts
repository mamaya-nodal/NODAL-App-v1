import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ closureId: string }> },
) {
  const access = await inspectNodalAdminAccess();
  if (access.status === "missing_session") return NextResponse.json({ error: "Sesión vencida." }, { status: 401 });
  if (access.status === "mfa_required") return NextResponse.json({ error: "MFA_REQUIRED" }, { status: 403 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Sin autorización." }, { status: 403 });
  const { closureId } = await context.params;
  const db = createServiceClient();
  const { data: report, error } = await db
    .from("period_closure_reports")
    .select("storage_bucket,storage_path,report_status")
    .eq("closure_version_id", closureId)
    .maybeSingle();
  if (error || !report || report.report_status !== "ready" || !report.storage_path) {
    return NextResponse.json({ error: "El informe todavía no está disponible." }, { status: 404 });
  }
  const { data: pdf, error: downloadError } = await db.storage
    .from(report.storage_bucket)
    .download(report.storage_path);
  if (downloadError || !pdf) {
    return NextResponse.json({ error: "No se pudo abrir el informe." }, { status: 502 });
  }
  return new NextResponse(await pdf.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="cierre-${closureId}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
