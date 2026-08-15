"use server";

import { redirect } from "next/navigation";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function authorizeAndProvisionStudent(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const displayName = text(formData, "display_name");
  const period = text(formData, "period_month");
  const reason = text(formData, "reason");
  if (!email || !period || !reason) redirect("/app/admin/users?result=invalid");

  const supabase = await requireNodalAdmin();
  const { error } = await supabase.rpc("admin_authorize_and_provision_nodal_user", {
    management_reason: reason,
    target_display_name: displayName || null,
    target_email: email,
    target_period_month: period,
  });
  redirect(`/app/admin/users?result=${error ? "not_authorized" : "authorized"}`);
}

export async function revokeStudent(formData: FormData) {
  const targetUserId = text(formData, "target_user_id");
  const reason = text(formData, "reason");
  if (!targetUserId || !reason) redirect("/app/admin/users?result=invalid");

  const supabase = await requireNodalAdmin();
  const { error } = await supabase.rpc("admin_revoke_nodal_student", {
    management_reason: reason,
    target_user_id: targetUserId,
  });
  redirect(`/app/admin/users?result=${error ? "not_revoked" : "revoked"}`);
}
