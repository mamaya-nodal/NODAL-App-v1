import { createClient } from "@/lib/supabase/server";
import { mimicalDownloadResponse } from "@/modules/addons/server/mimical-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const [{ data: active, error }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc("is_current_user_active"),
    supabase.from("nodal_users").select("configuration_enabled").eq("id", user.id).maybeSingle(),
  ]);
  if (error || profileError || !active || !profile?.configuration_enabled) return new Response("Forbidden", { status: 403 });
  return mimicalDownloadResponse();
}
