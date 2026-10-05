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

export async function reviewUserInvitation(formData: FormData) {
  const invitationId = text(formData, "invitation_id");
  const decision = text(formData, "decision");
  const displayName = text(formData, "display_name");
  const reason = text(formData, "reason");
  const period = text(formData, "period_month");
  const commission = Number(text(formData, "commission_percent"));
  if (!invitationId || !reason || !period || !["approve", "reject"].includes(decision)
    || (decision === "approve" && (!Number.isFinite(commission) || commission < 0 || commission > 100))) {
    redirect("/app/admin/users?result=invalid_invitation");
  }
  const supabase = await requireNodalAdmin();
  const { error } = await supabase.rpc("admin_review_nodal_user_invitation", {
    management_reason: reason,
    target_approved: decision === "approve",
    target_commission_bps: decision === "approve" ? Math.round(commission * 100) : 0,
    target_display_name: displayName || null,
    target_invitation_id: invitationId,
    target_period_month: period,
  });
  redirect(`/app/admin/users?result=${error ? "invitation_review_failed" : decision === "approve" ? "invitation_approved" : "invitation_rejected"}`);
}
