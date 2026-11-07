export const repairActions = {
  register_account: { label: "Registrar cuenta detectada", required: ["company_id", "connector_id", "external_account_name", "connection_name", "first_seen_at", "purchased_on", "price_cents", "funds_origin", "wallet_id", "phase", "completed_days"], incident: "missing_account" },
  purchase_origin: { label: "Corregir origen de compra", required: ["account_id", "wallet_id", "price_cents"], incident: "purchase_origin" },
  approve_payout: { label: "Registrar payout aprobado", required: ["account_id", "approved_on", "amount_cents"], incident: "payout" },
  collect_payout: { label: "Registrar cobro de payout", required: ["withdrawal_id", "wallet_id", "collected_on", "fee_cents"], incident: "payout" },
  wallet_movement: { label: "Registrar movimiento de billetera", required: ["wallet_id", "occurred_on", "kind", "amount_cents", "fee_cents"], incident: "wallet_movement" },
  broker_transfer: { label: "Conciliar transferencia detectada", required: ["event_id", "wallet_id", "occurred_on", "kind", "fee_cents"], incident: "broker_transfer" },
  coverage_members: { label: "Vincular cuentas a la operación", required: ["batch_id", "account_ids", "close_accounts"], incident: "coverage_members" },
  correct_balance: { label: "Corregir saldo y reconstruir operaciones", required: ["daily_control_id", "balance_cents", "reason"], incident: "missing_operation" },
  recover_operation: { label: "Recuperar operación y recalcular las siguientes", required: ["account_ids", "operated_on", "phase", "balance_before_cents", "balance_cents", "after_control_id", "evidence_note"], incident: "missing_operation" },
  account_progress: { label: "Corregir días completados", required: ["account_id", "phase", "completed_days"], incident: "account_progress" },
  account_state: { label: "Recalcular estado de cuenta", required: ["account_id"], incident: "account_state" },
  retry_reconciliation: { label: "Reintentar conciliación", required: ["batch_id"], incident: "coverage_members" },
} as const;

export type ActionName = keyof typeof repairActions;
export function parseRepairAction(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("repair_request_invalid");
  const body = input as Record<string, unknown>;
  if (typeof body.action !== "string" || !Object.hasOwn(repairActions, body.action)) throw new Error("repair_action_unknown");
  const action = body.action as ActionName;
  if (typeof body.periodId !== "string" || !uuid(body.periodId)) throw new Error("repair_period_invalid");
  if (!body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) throw new Error("repair_parameters_invalid");
  const params = body.parameters as Record<string, unknown>;
  const required: readonly string[] = repairActions[action].required;
  const parameters: Record<string, string | number | boolean | string[]> = {};
  for (const key of required) {
    const value = params[key];
    if ((key === "after_control_id" || (key === "wallet_id" && action === "register_account" && params.funds_origin === "Aporte trader")) && value === "") {
      parameters[key] = "";
    } else if (key.endsWith("_cents") || key === "completed_days") {
      if (!Number.isSafeInteger(value) || Number(value) < 0 || (key === "amount_cents" && value === 0)) throw new Error(`repair_invalid:${key}`);
      parameters[key] = Number(value);
    } else if (key === "account_ids") {
      if (!Array.isArray(value) || !value.length || value.length > 250 || !value.every((id) => typeof id === "string" && uuid(id)) || new Set(value).size !== value.length) throw new Error("repair_accounts_invalid");
      parameters[key] = value;
    } else if (key === "close_accounts") {
      if (typeof value !== "boolean") throw new Error("repair_closure_confirmation_required");
      parameters[key] = value;
    } else {
      if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`repair_missing:${key}`);
      if (key.endsWith("_id") && !uuid(value)) throw new Error(`repair_invalid:${key}`);
      if (key.endsWith("_on") && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`repair_invalid:${key}`);
      parameters[key] = value.trim();
    }
  }
  if (action === "wallet_movement" && !["external_contribution", "personal_withdrawal", "contribution_refund"].includes(String(parameters.kind))) throw new Error("repair_movement_kind_invalid");
  if (action === "broker_transfer" && !["broker_to_wallet", "wallet_to_broker"].includes(String(parameters.kind))) throw new Error("repair_transfer_kind_invalid");
  if (action === "recover_operation" && String(parameters.evidence_note).length < 10) throw new Error("repair_evidence_required");
  if (parameters.phase && !["Evaluacion", "Primera vuelta", "Segunda vuelta", "Tercera vuelta", "Cuarta vuelta", "Quinta vuelta"].includes(String(parameters.phase))) throw new Error("repair_phase_invalid");
  if (action === "register_account" && (!["Aporte trader", "Saldo generado"].includes(String(parameters.funds_origin)) || !Number.isFinite(Date.parse(String(parameters.first_seen_at))))) throw new Error("repair_account_invalid");
  return { action, parameters, periodId: body.periodId };
}
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
