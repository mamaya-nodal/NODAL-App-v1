import { NextResponse } from "next/server";

import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";
import { runDeterministicNodalitoQuery } from "@/modules/agent/server/run-deterministic-query";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";

export async function POST(request: Request) {
  const access = await inspectNodalAdminAccess();
  if (access.status !== "allowed") {
    return NextResponse.json({ message: "La auditoría requiere una sesión de Admin Master con MFA." }, { status: 403 });
  }

  const { data: { user } } = await access.supabase.auth.getUser();
  if (!canUseNodalAgentPilot(user?.email)) {
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
    const answer = await runDeterministicNodalitoQuery(question);
    return NextResponse.json({ answer, mode: "deterministic" });
  } catch (error) {
    console.error("nodalito_deterministic_query_failed", error);
    return NextResponse.json({ message: "No pude completar la auditoría determinística." }, { status: 500 });
  }
}
