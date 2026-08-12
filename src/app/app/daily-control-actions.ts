"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  OPERATION_PHASES,
  type OperationPhase,
} from "@/modules/control-diario/domain/account-selection";
import {
  CONTROL_ORIGIN_DESTINATIONS,
  type ControlOriginDestination,
} from "@/modules/control-diario/domain/control-catalogs";

export type ConfirmDailyControlInput = Readonly<{
  amountInCents: number | null;
  balanceInCents: number | null;
  companyId: string | null;
  confirmationKey: string;
  kind: "deposit" | "withdrawal" | "balance_update";
  leaderAccountId: string | null;
  originDestination: ControlOriginDestination | null;
  periodId: string;
  phase: OperationPhase | null;
  receivedBalanceInCents: number | null;
  replicaAccountIds: string[];
  syncIssueReason: string | null;
}>;

export type ConfirmDailyControlResult =
  | Readonly<{
      ok: true;
      control: {
        balanceAfterInCents: number;
        controlNumber: number;
        dailyControlId: string;
        operationEntriesCreated: number;
        operatingResultInCents: number | null;
      };
    }>
  | Readonly<{ ok: false; message: string }>;

function currentDateInBuenosAires(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function isSafeCents(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validateInput(input: ConfirmDailyControlInput): string | null {
  if (!isUuid(input.periodId) || !isUuid(input.confirmationKey)) {
    return "El contexto de guardado no es válido. Recargá la página e intentá nuevamente.";
  }

  if (input.kind === "deposit" || input.kind === "withdrawal") {
    if (
      !isSafeCents(input.amountInCents) ||
      !input.originDestination ||
      !CONTROL_ORIGIN_DESTINATIONS.includes(input.originDestination)
    ) {
      return "Revisá el importe y el origen o destino del movimiento.";
    }
    return null;
  }

  if (
    !isSafeCents(input.balanceInCents) ||
    !isSafeCents(input.receivedBalanceInCents) ||
    !input.companyId ||
    !isUuid(input.companyId) ||
    !input.leaderAccountId ||
    !isUuid(input.leaderAccountId) ||
    !input.phase ||
    !OPERATION_PHASES.includes(input.phase) ||
    input.replicaAccountIds.some((accountId) => !isUuid(accountId))
  ) {
    return "La empresa, las cuentas, la fase o el saldo no son válidos.";
  }

  if (
    input.balanceInCents !== input.receivedBalanceInCents &&
    !input.syncIssueReason?.trim()
  ) {
    return "Una corrección del saldo debe indicar el problema de sincronización.";
  }

  if (
    input.balanceInCents === input.receivedBalanceInCents &&
    input.syncIssueReason?.trim()
  ) {
    return "El saldo corregido debe ser diferente del saldo recibido originalmente.";
  }

  const participantIds = [input.leaderAccountId, ...input.replicaAccountIds];
  if (new Set(participantIds).size !== participantIds.length) {
    return "La cuenta líder y las réplicas no pueden repetirse.";
  }

  return null;
}

function friendlyDatabaseError(message: string): string {
  if (message.includes("first confirmed entry must be a deposit")) {
    return "Primero registrá el depósito inicial que establece el saldo de referencia.";
  }
  if (message.includes("cannot be divided into exact cents")) {
    return "El resultado no puede dividirse en centavos exactos entre las cuentas elegidas.";
  }
  if (message.includes("Earlier entries require")) {
    return "La fecha es anterior al último control guardado y requiere el flujo de corrección.";
  }
  if (message.includes("cannot exceed the confirmed balance")) {
    return "El retiro no puede superar el último saldo confirmado.";
  }
  if (message.includes("selected company and period")) {
    return "Todas las cuentas deben pertenecer a la empresa y al período seleccionados.";
  }
  if (message.includes("different")) {
    return "El saldo corregido debe ser diferente del saldo actual.";
  }
  if (message.includes("withdrawal exceed")) {
    return "La corrección dejaría un retiro por encima del saldo disponible.";
  }
  if (message.includes("cannot be divided into exact cents")) {
    return "La corrección afectaría una distribución que no cierra en centavos exactos.";
  }
  return "No se pudo guardar el movimiento. No se creó ningún registro.";
}

export async function confirmDailyControl(
  input: ConfirmDailyControlInput,
): Promise<ConfirmDailyControlResult> {
  const validationMessage = validateInput(input);
  if (validationMessage) return { ok: false, message: validationMessage };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const isBalanceUpdate = input.kind === "balance_update";
  const { data, error } = await supabase.rpc("confirm_nodal_daily_control", {
    target_amount_cents: input.amountInCents,
    target_balance_cents: input.balanceInCents,
    target_company_id: input.companyId,
    target_confirmation_key: input.confirmationKey,
    target_kind: input.kind,
    target_leader_account_id: input.leaderAccountId,
    target_observations: isBalanceUpdate
      ? "Recepción simulada durante el desarrollo previo a NinjaTrader"
      : null,
    target_operated_on: currentDateInBuenosAires(),
    target_origin_destination: input.originDestination,
    target_period_id: input.periodId,
    target_phase: input.phase,
    target_received_balance_cents: input.receivedBalanceInCents,
    target_replica_account_ids: input.replicaAccountIds,
    target_source: isBalanceUpdate ? "ninjatrader" : "manual",
    target_source_event_key: isBalanceUpdate
      ? `development-simulation:${input.confirmationKey}`
      : null,
    target_sync_issue_reason: input.syncIssueReason?.trim() || null,
  });

  if (error) return { ok: false, message: friendlyDatabaseError(error.message) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, message: "El servidor no devolvió la confirmación esperada." };
  }

  revalidatePath("/app");
  return {
    ok: true,
    control: {
      balanceAfterInCents: Number(row.balance_after_cents),
      controlNumber: Number(row.control_number),
      dailyControlId: row.daily_control_id,
      operationEntriesCreated: Number(row.operation_entries_created),
      operatingResultInCents:
        row.operating_result_cents === null
          ? null
          : Number(row.operating_result_cents),
    },
  };
}

export type CorrectDailyControlBalanceInput = Readonly<{
  correctedBalanceInCents: number;
  dailyControlId: string;
  periodId: string;
  reason: string;
}>;

export type CorrectDailyControlBalanceResult =
  | Readonly<{
      ok: true;
      affectedControls: number;
      affectedOperationEntries: number;
      controls: Array<{
        balanceInCents: number;
        controlId: string;
        id: number;
        kind: "deposit" | "withdrawal" | "balance_update";
        operatingResultInCents: number | null;
        valueInCents: number;
      }>;
    }>
  | Readonly<{ ok: false; message: string }>;

export async function correctDailyControlBalance(
  input: CorrectDailyControlBalanceInput,
): Promise<CorrectDailyControlBalanceResult> {
  if (
    !isUuid(input.periodId) ||
    !isUuid(input.dailyControlId) ||
    !isSafeCents(input.correctedBalanceInCents) ||
    !input.reason.trim()
  ) {
    return { ok: false, message: "Indicá un saldo corregido y un motivo válido." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const { data, error } = await supabase.rpc("correct_nodal_daily_control_balance", {
    target_balance_cents: input.correctedBalanceInCents,
    target_daily_control_id: input.dailyControlId,
    target_period_id: input.periodId,
    target_reason: input.reason.trim(),
  });
  if (error) return { ok: false, message: friendlyDatabaseError(error.message) };

  const resultRow = Array.isArray(data) ? data[0] : data;
  const { data: controlRows, error: readError } = await supabase
    .from("daily_controls")
    .select("id, control_number, kind, movement_cents, balance_after_cents, operating_result_cents")
    .eq("period_id", input.periodId)
    .order("control_number");
  if (readError || !resultRow) {
    return {
      ok: false,
      message: "La corrección se guardó, pero no pudo actualizarse la vista. Recargá la página.",
    };
  }

  revalidatePath("/app");
  return {
    ok: true,
    affectedControls: Number(resultRow.affected_controls),
    affectedOperationEntries: Number(resultRow.affected_operation_entries),
    controls: (controlRows ?? []).map((control) => ({
      balanceInCents: Number(control.balance_after_cents),
      controlId: control.id,
      id: control.control_number,
      kind: control.kind,
      operatingResultInCents:
        control.operating_result_cents === null
          ? null
          : Number(control.operating_result_cents),
      valueInCents:
        control.kind === "balance_update"
          ? Number(control.balance_after_cents)
          : Number(control.movement_cents),
    })),
  };
}
