"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { runAccountingPeriodClose } from "@/modules/accounting/server/run-period-close";
import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

export type ClosureActionResult = Readonly<{ message: string; ok: boolean }>;

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function cents(form: FormData, key: string): number | null {
  const raw = value(form, key).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function refresh() {
  revalidatePath("/app/admin/periods");
  revalidatePath("/app", "layout");
}

export async function retryAccountingClosures(
  _previous: ClosureActionResult,
  _form: FormData,
): Promise<ClosureActionResult> {
  void _previous;
  void _form;
  const db = await requireNodalAdmin();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { message: "La sesión ya no está disponible.", ok: false };

  try {
    const outcome = await runAccountingPeriodClose(createServiceClient(), "manual", user.id);
    refresh();
    if (outcome.failed.length > 0) {
      return { message: `${outcome.closedPeriodIds.length} cierres completados y ${outcome.failed.length} pendientes.`, ok: false };
    }
    return {
      message: outcome.closedPeriodIds.length === 0
        ? "No había períodos vencidos pendientes."
        : `${outcome.closedPeriodIds.length} cierres completados.`,
      ok: true,
    };
  } catch {
    return { message: "No se pudo ejecutar el cierre. El intento quedó registrado.", ok: false };
  }
}

export async function rectifyAccountingClosure(
  _previous: ClosureActionResult,
  form: FormData,
): Promise<ClosureActionResult> {
  const resultAdjustment = cents(form, "result_adjustment");
  const commissionAdjustment = cents(form, "commission_adjustment");
  const reason = value(form, "reason");
  const evidence = value(form, "evidence");
  if (resultAdjustment === null || commissionAdjustment === null) {
    return { message: "Ingresá importes válidos; usá cero cuando no haya ajuste.", ok: false };
  }
  if (resultAdjustment === 0 && commissionAdjustment === 0) {
    return { message: "La rectificación debe contener al menos un ajuste.", ok: false };
  }
  if (!reason || !evidence) {
    return { message: "El motivo y la evidencia son obligatorios.", ok: false };
  }

  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_record_period_rectification", {
    target_commission_adjustment_cents: commissionAdjustment,
    target_evidence: evidence,
    target_period_id: value(form, "period_id"),
    target_reason: reason,
    target_result_adjustment_cents: resultAdjustment,
  });
  if (error) return { message: "No se pudo rectificar el cierre. Revisá los datos.", ok: false };
  refresh();
  return { message: "Cierre rectificado y ajuste incorporado al período vigente.", ok: true };
}

export async function resolveAccountingClosureObservation(
  _previous: ClosureActionResult,
  form: FormData,
): Promise<ClosureActionResult> {
  const resolution = value(form, "resolution");
  const evidence = value(form, "evidence");
  if (!resolution || !evidence) {
    return { message: "La explicación y la evidencia son obligatorias.", ok: false };
  }

  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_resolve_period_closure_observation", {
    target_evidence: evidence,
    target_period_id: value(form, "period_id"),
    target_resolution: resolution,
  });
  if (error) return { message: "No se pudo resolver la observación.", ok: false };
  refresh();
  return { message: "Observación resuelta y auditada.", ok: true };
}

export async function approveAccountingClosure(
  _previous: ClosureActionResult,
  form: FormData,
): Promise<ClosureActionResult> {
  const confirmed = form.get("approval_confirmed") === "on";
  if (!confirmed) return { message: "Confirmá que revisaste el cierre antes de aprobarlo.", ok: false };

  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_approve_period_closure", {
    target_period_id: value(form, "period_id"),
  });
  if (error?.message.includes("UNRESOLVED_OBSERVATIONS")) {
    return { message: "Primero resolvé o rectificá las observaciones del cierre.", ok: false };
  }
  if (error) return { message: "No se pudo aprobar el cierre.", ok: false };
  refresh();
  return { message: "Cierre aprobado. El envío quedó esperando el informe PDF y la factura.", ok: true };
}

