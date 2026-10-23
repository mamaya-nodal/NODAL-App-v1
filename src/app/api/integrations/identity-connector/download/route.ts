import { createClient } from "@/lib/supabase/server";
import { connectorDownloadResponse } from "@/modules/ninja/server/connector-download";
import { createInstallerAuthorization } from "@/modules/ninja/server/installer-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function validToken(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installationId");
  const token = url.searchParams.get("token");
  if (!validUuid(installationId) || !validToken(token)) {
    return new Response("El enlace no es válido.", { status: 400 });
  }

  const supabase = await createClient();
  const authorization = createInstallerAuthorization();
  const { data: available, error } = await supabase.rpc("consume_identity_connector_download_with_pairing", {
    target_code_hash: authorization.codeHash,
    target_pairing_expires_at: authorization.expiresAt,
    target_installation_id: installationId,
    target_token: token,
  });
  if (error || !available) {
    return new Response("El enlace venció o fue reemplazado. Pedí uno nuevo al usuario NODAL.", { status: 410 });
  }
  return connectorDownloadResponse(authorization.code);
}
