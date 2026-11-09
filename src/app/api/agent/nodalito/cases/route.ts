import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";
import { repairChanges } from "@/modules/agent/domain/repair-summary";

const allowedStatuses = new Set(["open", "investigating", "resolved", "dismissed"]);

async function context() {
  const access = await inspectNodalAdminAccess();
  const { data } = await access.supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;
  const email = typeof data?.claims.email === "string" ? data.claims.email : null;
  return { access, email, userId };
}

export async function GET() {
  const { access, email, userId } = await context();
  if (!userId || !canUseNodalAgentPilot(email)) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const service = createServiceClient();
  let query = service.from("nodal_agent_cases")
    .select("id,status,priority,category,title,description,evidence,source_question,resolution_note,reviewed_at,created_at,updated_at,subject_user_id,nodal_users!nodal_agent_cases_subject_user_id_fkey(display_name,email)")
    .order("created_at", { ascending: false }).limit(100);
  if (access.status !== "allowed") query = query.eq("subject_user_id", userId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ message: "No pude leer los casos." }, { status: 500 });
  const cases = (data ?? []).map((item) => {
    if (!item.evidence || Array.isArray(item.evidence) || !item.evidence.planId) return item;
    const evidence = item.evidence;
    return { ...item, evidence: { planId: evidence.planId, parameters: evidence.parameters, reversal: evidence.reversal, changes: repairChanges(evidence.changes) } };
  });
  let latestAudit = null;
  if (access.status === "allowed") {
    const audit = await service.from("nodalito_audit_runs")
      .select("id,started_at,finished_at,status,target_count,reviewed_count,failed_count,critical_count,attention_count,informational_count,opened_case_count")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!audit.error) latestAudit = audit.data;
  }
  return NextResponse.json({ audit: latestAudit, cases, master: access.status === "allowed" });
}

export async function POST(request: Request) {
  const { email, userId } = await context();
  if (!userId || !canUseNodalAgentPilot(email)) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
  if (!title || !description) return NextResponse.json({ message: "Faltan los datos del reporte." }, { status: 400 });
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 20) : [];
  const priority = body.priority === "critical" ? "critical" : body.priority === "high" ? "high" : "normal";
  const service = createServiceClient();
  const { data, error } = await service.from("nodal_agent_cases").insert({
    category: typeof body.category === "string" ? body.category.slice(0, 60) : "general",
    description, evidence, priority, reporter_user_id: userId,
    source_answer: typeof body.sourceAnswer === "string" ? body.sourceAnswer.slice(0, 6000) : null,
    source_question: typeof body.sourceQuestion === "string" ? body.sourceQuestion.slice(0, 1000) : null,
    subject_user_id: userId, title,
  }).select("id,status,created_at").single();
  if (error) return NextResponse.json({ message: "No pude crear el caso." }, { status: 500 });
  return NextResponse.json({ case: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { access, userId } = await context();
  if (!userId || access.status !== "allowed") return NextResponse.json({ message: "Se requiere Admin Master con MFA." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!id || !allowedStatuses.has(status)) return NextResponse.json({ message: "Cambio inválido." }, { status: 400 });
  const service = createServiceClient();
  const { error } = await service.from("nodal_agent_cases").update({
    ...(typeof body.resolutionNote === "string" ? { resolution_note: body.resolutionNote.trim().slice(0, 4000) } : {}),
    reviewed_at: new Date().toISOString(), reviewed_by: userId, status, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ message: "No pude actualizar el caso." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
