import { NextResponse } from "next/server";

import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";
import { askNodalito, NodalitoConfigurationError } from "@/modules/agent/server/openai-nodalito";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";

export async function POST(request: Request) {
  const access = await inspectNodalAdminAccess();
  const { data: claimsData } = await access.supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  const userEmail = typeof claimsData?.claims.email === "string" ? claimsData.claims.email : null;
  if (!userId || !canUseNodalAgentPilot(userEmail)) {
    return NextResponse.json({ message: "Nodalito todavía está habilitado únicamente en el piloto privado." }, { status: 403 });
  }

  let question = "";
  try {
    const body = await request.json() as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ message: "La consulta no tiene un formato válido." }, { status: 400 });
  }
  if (!question || question.length > 600) {
    return NextResponse.json({ message: "Escribí una consulta de hasta 600 caracteres." }, { status: 400 });
  }

  try {
    // Las guías se pueden consultar desde la app personal. Los datos reales del
    // Master Control sólo se habilitan después de verificar MFA.
    const role = access.status === "allowed" ? "master" : "trader";
    const result = await askNodalito({ question, role, safetyUserId: userId });
    return NextResponse.json({
      answer: {
        findings: result.mode === "audit" ? result.findings : [],
        summary: result.text,
      },
      mode: result.mode,
    });
  } catch (error) {
    if (error instanceof NodalitoConfigurationError) {
      return NextResponse.json({ message: "Falta configurar la conexión segura con OpenAI para activar la comprensión libre de Nodalito." }, { status: 503 });
    }
    console.error("nodalito_deterministic_query_failed", error);
    return NextResponse.json({ message: "No pude completar la consulta de Nodalito. No se modificó ningún dato." }, { status: 500 });
  }
}
