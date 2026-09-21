import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!secret || secret.length > 512) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: authorized, error: authorizationError } = await supabase.rpc("validate_integration_webhook_secret", {
    target_name: "identity_onboarding_apps_script",
    target_secret: secret,
  });
  if (authorizationError || !authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const requestId = text(payload.requestId, 36);
  const email = text(payload.email, 254).toLowerCase();
  const firstName = text(payload.firstName, 100);
  const lastName = text(payload.lastName, 100);
  const documentReference = text(payload.documentReference, 100);
  const phone = text(payload.phone, 100);
  const driveFolderUrl = text(payload.driveFolderUrl, 500);
  const responseId = text(payload.responseId, 300);
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !email || !firstName || !lastName || !documentReference || !phone || !driveFolderUrl || !responseId) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("submit_identity_onboarding_response", {
    target_document_reference: documentReference,
    target_drive_folder_url: driveFolderUrl,
    target_email: email,
    target_first_name: firstName,
    target_last_name: lastName,
    target_phone: phone,
    target_request_id: requestId,
    target_response_id: responseId,
  });
  if (error || !data) return Response.json({ error: "Request not found" }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
