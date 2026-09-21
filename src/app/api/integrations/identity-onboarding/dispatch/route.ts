import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });
  const { action, requestId, token } = payload as Record<string, unknown>;
  if (!validUuid(requestId) || !validToken(token)) return Response.json({ error: "Invalid request" }, { status: 400 });

  const supabase = await createClient();
  if (action === "lookup") {
    const { data, error } = await supabase.rpc("get_identity_invitation_dispatch", {
      target_request_id: requestId,
      target_token: token,
    });
    const dispatch = Array.isArray(data) ? data[0] : null;
    if (error || !dispatch) return Response.json({ error: "Invitation not found" }, { status: 404 });
    return Response.json({
      recipientEmail: dispatch.recipient_email,
      referentName: dispatch.referent_name,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "sent") {
    const { data, error } = await supabase.rpc("mark_identity_invitation_sent", {
      target_request_id: requestId,
      target_token: token,
    });
    if (error || !data) return Response.json({ error: "Invitation not found" }, { status: 404 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
