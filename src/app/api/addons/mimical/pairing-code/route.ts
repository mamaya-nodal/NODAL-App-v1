import { createClient } from "@/lib/supabase/server";
import { mimicalPilotEnabled } from "@/modules/addons/domain/mimical-pilot";
import { createInstallerAuthorization, isIdentityId } from "@/modules/ninja/server/installer-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return new Response("Solicitud demasiado grande.", { status: 413 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: active, error } = await supabase.rpc("is_current_user_active");
  if (error || !active || !mimicalPilotEnabled(user.id)) return new Response("Forbidden", { status: 403 });
  let payload: unknown = {};
  try { payload = await request.json(); } catch { /* personal context */ }
  const identityId = payload && typeof payload === "object" && "identityId" in payload
    ? (payload as { identityId?: unknown }).identityId
    : null;
  if (identityId !== null && identityId !== undefined && !isIdentityId(identityId)) {
    return Response.json({ error: "La identidad no es válida." }, { status: 422 });
  }
  const authorization = createInstallerAuthorization();
  const { error: pairingError } = await supabase.rpc("create_addon_pairing_code", {
    target_code_hash: authorization.codeHash,
    target_expires_at: authorization.expiresAt,
    target_identity_id: identityId ?? null,
    target_product_key: "mimical",
  });
  if (pairingError) return Response.json({ error: "No se pudo generar el código." }, { status: 409 });
  return Response.json({ code: authorization.code, expiresAt: authorization.expiresAt }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
