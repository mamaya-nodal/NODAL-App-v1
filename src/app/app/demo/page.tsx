import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";

import { AppWorkspace } from "../app-workspace";
import { DemoAccountingWorkspace } from "./demo-accounting-workspace";

export default async function AccountingDemoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && process.env.NODE_ENV !== "development") redirect("/");

  const { data: nodalUser } = user
    ? await supabase
      .from("nodal_users")
      .select("id, email, display_name, access_state, access_role")
      .eq("id", user.id)
      .maybeSingle()
    : { data: null };

  const allowed = !user || decideAccess(
    user.id,
    nodalUser ? { id: nodalUser.id, accessState: nodalUser.access_state } : null,
  ) === "allowed";

  if (!allowed) redirect("/app");

  return (
    <AppWorkspace
      authorized
      avatarUrl={typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null}
      initialView="accounts"
      isAdmin={nodalUser?.access_role === "admin"}
      userLabel={nodalUser?.display_name || nodalUser?.email || user?.email || "Simulación"}
      username={typeof user?.user_metadata?.username === "string" ? user.user_metadata.username : undefined}
    >
      <DemoAccountingWorkspace />
    </AppWorkspace>
  );
}
