import { createClient } from "@/lib/supabase/server";
import { loadAdminNinjaTestSupervision } from "@/modules/ninja/server/admin-test-supervision";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  if (!uuidPattern.test(userId)) {
    return Response.json({ error: "Usuario inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sesión vencida" }, { status: 401 });

  const { data: admin } = await supabase
    .from("nodal_users")
    .select("access_role,access_state")
    .eq("id", user.id)
    .maybeSingle();
  if (admin?.access_state !== "active" || admin.access_role !== "admin") {
    return Response.json({ error: "Sin autorización" }, { status: 403 });
  }

  try {
    const data = await loadAdminNinjaTestSupervision(supabase, userId);
    if (!data) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "No se pudo actualizar la supervisión" }, { status: 500 });
  }
}
