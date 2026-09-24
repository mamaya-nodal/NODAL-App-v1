import { createClient } from "@/lib/supabase/server";
import { connectorDownloadResponse } from "@/modules/ninja/server/connector-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: active, error } = await supabase.rpc("is_current_user_active");
  if (error || !active) return new Response("Forbidden", { status: 403 });
  return connectorDownloadResponse();
}
