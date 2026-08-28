"use server";

import { redirect } from "next/navigation";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function reviewNinjaConnection(formData: FormData) {
  const connectorId = text(formData, "connector_id");
  const connectionName = text(formData, "connection_name");
  const status = text(formData, "status");
  const reason = text(formData, "reason");
  if (!connectorId || !connectionName || !reason || !["approved", "isolated"].includes(status)) {
    redirect("/app/admin/ninja?result=invalid_connection");
  }

  const supabase = await requireNodalAdmin();
  const { error } = await supabase.rpc("admin_review_ninja_connector_connection", {
    management_reason: reason,
    target_connection_name: connectionName,
    target_connector_id: connectorId,
    target_status: status,
  });
  redirect(`/app/admin/ninja?result=${error ? "not_reviewed" : status}`);
}
