import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = (value: unknown): value is string =>
  typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const token = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!uuid(payload.ticketId) || !token(payload.token)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const supabase = await createClient();
  if (payload.action === "lookup") {
    const { data, error } = await supabase.rpc("get_support_ticket_dispatch", {
      target_ticket_id: payload.ticketId,
      target_token: payload.token,
    });
    const ticket = Array.isArray(data) ? data[0] : null;
    if (error || !ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });
    return Response.json({
      category: ticket.category,
      createdAt: ticket.created_at,
      description: ticket.description,
      requesterEmail: ticket.requester_email,
      requesterName: ticket.requester_name,
      subject: ticket.subject,
      ticketCode: ticket.ticket_code,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (payload.action === "sent") {
    const { data, error } = await supabase.rpc("mark_support_ticket_sent", {
      target_ticket_id: payload.ticketId,
      target_token: payload.token,
    });
    if (error || !data) return Response.json({ error: "Ticket not found" }, { status: 404 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ error: "Invalid action" }, { status: 400 });
}
