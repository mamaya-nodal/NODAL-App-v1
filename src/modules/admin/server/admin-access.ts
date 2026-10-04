import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasVerifiedMfa, safeAdminNextPath } from "@/modules/access/domain/admin-mfa";

export type NodalAdminAccess =
  | Readonly<{ status: "allowed"; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }>
  | Readonly<{ status: "missing_session" | "forbidden" | "mfa_required"; supabase: Awaited<ReturnType<typeof createClient>>; userId: string | null }>;

export async function inspectNodalAdminAccess(): Promise<NodalAdminAccess> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsError ? null : claimsData?.claims.sub;
  if (!userId) return { status: "missing_session", supabase, userId: null };

  const { data: nodalUser } = await supabase
    .from("nodal_users")
    .select("access_state, access_role")
    .eq("id", userId)
    .maybeSingle();

  if (nodalUser?.access_state !== "active" || nodalUser.access_role !== "admin") {
    return { status: "forbidden", supabase, userId };
  }
  if (!hasVerifiedMfa(claimsData?.claims.aal)) {
    return { status: "mfa_required", supabase, userId };
  }
  return { status: "allowed", supabase, userId };
}

export async function requireNodalAdmin(nextPath = "/app/admin") {
  const access = await inspectNodalAdminAccess();
  if (access.status === "missing_session") redirect("/");
  if (access.status === "forbidden") redirect("/app");
  if (access.status === "mfa_required") {
    redirect(`/auth/mfa?next=${encodeURIComponent(safeAdminNextPath(nextPath))}`);
  }
  return access.supabase;
}
