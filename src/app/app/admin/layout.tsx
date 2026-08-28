import type { ReactNode } from "react";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { AdminWorkspace } from "./admin-workspace";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await requireNodalAdmin();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("nodal_users").select("display_name, email").eq("id", user.id).maybeSingle()
    : { data: null };

  return <AdminWorkspace userLabel={profile?.display_name || profile?.email || "Administrador"}>{children}</AdminWorkspace>;
}
