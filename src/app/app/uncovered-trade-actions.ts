"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { persistAutomaticOperationBatches } from "@/modules/ninja/server/automatic-operation-processing";

export async function confirmUncoveredTrade(input: Readonly<{
  batchId: string;
  resultInCents: number;
  confirmed: boolean;
}>): Promise<{ ok: boolean; message: string }> {
  if (!input.confirmed || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.batchId)
    || !Number.isSafeInteger(input.resultInCents)) {
    return { ok: false, message: "Confirmá el trade y su importe antes de registrarlo." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { data: controlId, error } = await supabase.rpc("confirm_ninja_uncovered_trade", {
    target_batch_id: input.batchId,
    target_result_cents: input.resultInCents,
    target_confirmed: true,
  });
  if (error) {
    const detail = error.message.toLowerCase();
    return { ok: false, message: detail.includes("earlier broker")
      ? "Primero conciliá los movimientos anteriores del broker."
      : detail.includes("historical trade")
        ? "Hay registros posteriores. Este trade necesita una corrección histórica controlada."
        : detail.includes("prop context")
          ? "Se detectaron cuentas prop relacionadas. Revisá la asignación antes de confirmar."
          : detail.includes("amount changed")
            ? "El importe cambió. Actualizá la página y revisalo antes de confirmar."
            : "No se pudo confirmar el trade. Actualizá la página y volvé a intentarlo." };
  }
  let followOnMessage = "Trade sin cobertura registrado.";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && typeof controlId === "string") {
    const service = createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: batch } = await service.from("ninja_operation_batches")
      .select("connector_id").eq("id", input.batchId).eq("daily_control_id", controlId).maybeSingle();
    if (batch) {
      const { data: connector } = await service.from("ninja_connectors")
        .select("owner_user_id").eq("id", batch.connector_id).eq("owner_user_id", user.id).maybeSingle();
      if (connector) {
        try {
          await persistAutomaticOperationBatches(batch.connector_id);
        } catch {
          followOnMessage = "Trade registrado. La cobertura siguiente se revisará al recibir señal del conector.";
        }
      }
    }
  }
  revalidatePath("/app");
  return { ok: true, message: followOnMessage };
}
