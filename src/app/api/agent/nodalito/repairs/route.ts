import { NextResponse } from "next/server";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";
import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";
import { prepareRepair } from "@/modules/agent/server/repair-tools";

/** Preview and application share the authenticated user's scope. Never accept SQL or owner IDs. */
export async function POST(request: Request) {
  const access = await inspectNodalAdminAccess();
  const { data, error } = await access.supabase.auth.getClaims();
  const email = typeof data?.claims.email === "string" ? data.claims.email : null;
  if (error || !data?.claims.sub || !canUseNodalAgentPilot(email)) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  if (process.env.NODALITO_REPAIRS_ENABLED !== "true") return NextResponse.json({ message: "Las reparaciones automáticas están en validación. Podés seguir consultando y reportando problemas." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  if (body.operation === "revert" && access.status !== "allowed") return NextResponse.json({ message: "La reversión requiere Admin Master con MFA." }, { status: 403 });
  if (body.operation === "apply" || body.operation === "revert") {
    if (typeof body.planId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.planId)) return NextResponse.json({ message: "Corrección inválida." }, { status: 400 });
    const result = await access.supabase.rpc(body.operation === "revert" ? "revert_nodalito_repair" : "apply_nodalito_repair", { target_plan_id: body.planId });
    if (result.error) return NextResponse.json({ message: "No se aplicó la corrección. Los datos cambiaron o necesitan revisión; prepará nuevamente el diagnóstico." }, { status: 409 });
    if (result.data?.status === "needs_review") return NextResponse.json({ message: result.data.message }, { status: 409 });
    return NextResponse.json({ receipt: result.data, message: body.operation === "revert" ? "Corrección revertida; la auditoría se conserva." : "Corrección aplicada y registrada para auditoría de Admin Master." });
  }
  if (body.operation !== "prepare") return NextResponse.json({ message: "Operación inválida." }, { status: 400 });
  try {
    return NextResponse.json(await prepareRepair(access.supabase, body));
  } catch { return NextResponse.json({ message: "Faltan datos válidos para preparar esta corrección." }, { status: 400 }); }
}
