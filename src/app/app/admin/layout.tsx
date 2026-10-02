import type { ReactNode } from "react";

import { currentAppRelease } from "@/lib/app-release";
import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { AdminWorkspace } from "./admin-workspace";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await requireNodalAdmin();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("nodal_users").select("display_name, email").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: connectorRows } = user
    ? await supabase.rpc("get_current_user_ninja_connector_status_v2")
    : { data: null };
  const connector = Array.isArray(connectorRows)
    ? connectorRows.find((row) => row.identity_id === null) ?? null
    : null;
  const appRelease = currentAppRelease();

  return (
    <AdminWorkspace
      userLabel={profile?.display_name || profile?.email || "Administrador"}
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
