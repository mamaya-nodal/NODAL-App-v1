import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const { error } = await createServiceClient()
    .from("nodal_users")
    .update({ last_app_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return Response.json({ ok: false }, { status: 503 });

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
