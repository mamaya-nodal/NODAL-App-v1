import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { inspectNodalAdminAccess } from "@/modules/admin/server/admin-access";
import { listLucidStrategies } from "@/modules/rutyx/server/catalog";

async function access() {
  const result = await inspectNodalAdminAccess();
  return result.status === "allowed" ? { actorId: result.userId, db: createServiceClient() } : null;
}

type Context = Readonly<{ params: Promise<{ userId: string }> }>;

export async function GET(_request: Request, context: Context) {
  const admin = await access();
  if (!admin) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const { userId } = await context.params;
  const { data, error } = await admin.db.from("rutyx_route_entitlements").select("strategy_id,enabled").eq("user_id", userId);
  if (error) return NextResponse.json({ message: "Rutyx todavía no está habilitado en esta versión." }, { status: 503 });
  const enabled = new Set((data ?? []).filter((row) => row.enabled).map((row) => row.strategy_id));
  return NextResponse.json({ strategies: listLucidStrategies(enabled) });
}

export async function POST(request: Request, context: Context) {
  const admin = await access();
  if (!admin) return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const { userId } = await context.params;
  const body = await request.json().catch(() => null) as { enabledStrategyIds?: string[] } | null;
  if (!Array.isArray(body?.enabledStrategyIds)) return NextResponse.json({ message: "Selección inválida." }, { status: 400 });
  const all = listLucidStrategies(new Set());
  const validIds = new Set(all.map((strategy) => strategy.id));
  const enabled = new Set(body.enabledStrategyIds.filter((id) => validIds.has(id)));
  const rows = all.map((strategy) => ({
    company_code: "LUCID",
    enabled: enabled.has(strategy.id),
    granted_by: admin.actorId,
    strategy_id: strategy.id,
    strategy_name: strategy.name,
    user_id: userId,
  }));
  const { error } = await admin.db.from("rutyx_route_entitlements").upsert(rows, { onConflict: "user_id,strategy_id" });
  if (error) return NextResponse.json({ message: "No se pudieron guardar las rutas." }, { status: 500 });
  return NextResponse.json({ strategies: listLucidStrategies(enabled) });
}
