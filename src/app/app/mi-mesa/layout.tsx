import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { currentAppRelease } from "@/lib/app-release";
import { loadMyAdministrationScope } from "@/modules/admin/server/administration-scope";
import { canOpenDeskAdmin } from "@/modules/admin/domain/administration-scope";

import { AdminWorkspace } from "../admin/admin-workspace";

export default async function MyDeskLayout({ children }: Readonly<{ children: ReactNode }>) {
  const scope = await loadMyAdministrationScope();
  if (!canOpenDeskAdmin(scope)) redirect("/app");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await supabase
    .from("nodal_users")
    .select("display_name,email")
    .eq("id", user.id)
    .maybeSingle();
  const { data: connectorRows } = await supabase.rpc(
    "get_current_user_ninja_connector_status_v2",
  );
  const connector = Array.isArray(connectorRows)
    ? connectorRows.find((row) => row.identity_id === null) ?? null
    : null;
  const appRelease = currentAppRelease();

  return (
    <AdminWorkspace
      scope="desk"
      userLabel={profile?.display_name || profile?.email || "Administrador de mesa"}
      versionInfo={{
        appRevision: appRelease.revision,
        appVersion: appRelease.version,
        connectorOnline: connector ? Boolean(connector.is_online) : null,
        connectorInstalledSourceVersion: typeof connector?.installed_source_version === "string" ? connector.installed_source_version : null,
        connectorVersion: typeof connector?.connector_version === "string" ? connector.connector_version : null,
      }}
    >
      {children}
    </AdminWorkspace>
  );
}

