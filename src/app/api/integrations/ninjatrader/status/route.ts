import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ online: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabase.rpc("get_current_user_ninja_connector_status");
  return Response.json(
    { online: !error && Boolean(data?.[0]?.is_online) },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: error ? 503 : 200 },
  );
}
