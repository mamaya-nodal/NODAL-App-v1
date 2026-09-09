import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loadMyAdministrationScope } from "@/modules/admin/server/administration-scope";

import { AdminWorkspace } from "../admin/admin-workspace";

export default async function MyDeskLayout({ children }: Readonly<{ children: ReactNode }>) {
  const scope = await loadMyAdministrationScope();
  if (scope.kind === "master") redirect("/app/admin");
  if (scope.kind !== "desk") redirect("/app");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await supabase
    .from("nodal_users")
    .select("display_name,email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AdminWorkspace scope="desk" userLabel={profile?.display_name || profile?.email || "Administrador de mesa"}>
      {children}
    </AdminWorkspace>
  );
}

