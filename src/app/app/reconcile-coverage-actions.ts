"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { persistAutomaticOperationBatches } from "@/modules/ninja/server/automatic-operation-processing";

export async function retryCoverageReconciliation(batchId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
    return { ok: false, message: "La operación no es válida." };
  }
  const caller = await createClient();
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return { ok: false, message: "Volvé a ingresar para revisar la operación." };
  const { data: profile, error: profileError } = await caller.from("nodal_users").select("access_state").eq("id", user.id).maybeSingle();
  if (profileError || profile?.access_state !== "active") return { ok: false, message: "No se pudo verificar tu acceso." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, message: "La revisión no está disponible en este momento." };
  // Technical tables are deliberately private. Verify ownership explicitly before
  // allowing the service-role processor to touch the selected operation.
  const service = createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: batch, error } = await service.from("ninja_operation_batches")
    .select("connector_id,broker_session_id,accounting_status").eq("id", batchId).maybeSingle();
  if (error || !batch) return { ok: false, message: "No se pudo consultar la operación." };
  const { data: connector, error: connectorError } = await service.from("ninja_connectors").select("id")
    .eq("id", batch.connector_id).eq("owner_user_id", user.id).eq("status", "active").maybeSingle();
  if (connectorError || !connector) return { ok: false, message: "La operación no pertenece a tu conexión activa." };
  if (batch.accounting_status === "committed") return { ok: true, message: "Esta operación ya está conciliada." };
  try {
    await persistAutomaticOperationBatches(batch.connector_id, Number(batch.broker_session_id));
    const { data: updated, error: readError } = await service.from("ninja_operation_batches")
      .select("accounting_status,accounting_blocking_reason").eq("id", batchId).maybeSingle();
    revalidatePath("/app");
    if (readError || !updated) return { ok: false, message: "No se pudo verificar el resultado. Actualizá la pantalla antes de volver a intentar." };
    return updated.accounting_status === "committed"
      ? { ok: true, message: "Operación conciliada." }
      : { ok: false, message: updated.accounting_blocking_reason ?? "Revisá los datos de la cuenta antes de volver a intentar." };
  } catch {
    return { ok: false, message: "No se pudo completar la revisión. Podés volver a intentarlo." };
  }
}
