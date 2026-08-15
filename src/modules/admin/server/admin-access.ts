import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function requireNodalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: nodalUser } = await supabase
    .from("nodal_users")
    .select("access_state, access_role")
    .eq("id", user.id)
    .maybeSingle();

  if (nodalUser?.access_state !== "active" || nodalUser.access_role !== "admin") {
    redirect("/app");
  }

  return supabase;
}
