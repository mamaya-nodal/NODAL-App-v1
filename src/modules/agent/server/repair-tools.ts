import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRepairAction, repairActions } from "../domain/repair-actions";
import { incidentKinds, incidentRequirements, type IncidentKind } from "../domain/repair-workflow";
import { createServiceClient } from "@/lib/supabase/service";
import { repairSummary, repairChanges } from "../domain/repair-summary";

export type RepairPreview = { planId: string; label: string; details?: string[]; parameters: Record<string, string | number | boolean | string[]> };
export async function readRepairContext(db: SupabaseClient) {
  const result = await db.rpc("get_nodalito_repair_context");
  if (result.error || !result.data) throw new Error("No pude leer los registros autorizados para esta investigación.");
  return result.data;
}

export async function prepareRepair(db: SupabaseClient, input: unknown): Promise<RepairPreview> {
  const draft = parseRepairAction(input);
  const result = await db.rpc("prepare_nodalito_repair", { target_period_id: draft.periodId, target_action: draft.action, target_parameters: draft.parameters });
  if (result.error || typeof result.data !== "string") throw new Error("No pude preparar la corrección. Necesita revisión y no se modificó ningún dato.");
  const preview = await db.rpc("get_nodalito_repair", { target_plan_id: result.data });
  if (preview.error || preview.data?.status !== "ready" || !Array.isArray(preview.data?.simulation)) {
    throw new Error("La simulación no permitió validar esta corrección. No cambié registros contables; el caso quedó en revisión de Admin Master.");
  }
  const details = [...repairSummary(draft.parameters), ...repairChanges(preview.data.simulation)];
  const accountIds = Array.isArray(draft.parameters.account_ids) ? draft.parameters.account_ids : typeof draft.parameters.account_id === "string" ? [draft.parameters.account_id] : [];
  if (accountIds.length) {
    const names = preview.data.accountNames;
    if (!Array.isArray(names) || names.length !== accountIds.length) throw new Error("No pude identificar todas las cuentas de la corrección.");
    details.unshift(`Cuentas: ${names.join(", ")}`);
  }
  if (typeof draft.parameters.wallet_id === "string" && draft.parameters.wallet_id) {
    if (typeof preview.data.walletName !== "string") throw new Error("No pude identificar la billetera.");
    details.unshift(`Billetera: ${preview.data.walletName}`);
  }
  details.push("La simulación contable pasó. El cambio quedará registrado para revisión de Admin Master.");
  return { planId: result.data, label: repairActions[draft.action].label, parameters: draft.parameters, details };
}

export async function openRepairIncident(ownerId: string, question: string, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("incident_invalid");
  const body = input as Record<string, unknown>;
  if (!incidentKinds.includes(body.kind as IncidentKind) || typeof body.description !== "string" || !body.description.trim()) throw new Error("incident_invalid");
  const kind = body.kind as IncidentKind;
  const db = createServiceClient();
  const { data: existing, error: lookupError } = await db.from("nodal_agent_cases").select("id").eq("subject_user_id", ownerId).eq("category", `incident:${kind}`).eq("source_question", question).in("status", ["open", "investigating"]).limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return { caseId: existing[0].id, state: "needs_review", message: "La investigación ya está en la bandeja privada de Admin Master." };
  const { data, error } = await db.from("nodal_agent_cases").insert({
    reporter_user_id: ownerId, subject_user_id: ownerId, status: "open", priority: "normal",
    category: `incident:${kind}`, title: question.slice(0, 160), description: body.description.slice(0, 4000),
    source_question: question.slice(0, 1000), evidence: { kind, requirements: incidentRequirements[kind], source: "trader_report", verified: false },
  }).select("id").single();
  if (error || !data) throw new Error("incident_save_failed");
  return { caseId: data.id, state: "needs_review", message: "La investigación quedó registrada en la bandeja privada de Admin Master. Todavía no se modificó la contabilidad." };
}
