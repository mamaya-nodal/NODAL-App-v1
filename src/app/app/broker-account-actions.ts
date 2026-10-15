"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ActionResult = Readonly<{ message: string; ok: boolean }>;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function renameBrokerAccount(input: Readonly<{
  accountName: string;
  connectionName: string;
  displayName: string;
}>): Promise<ActionResult> {
  const accountName = input.accountName.trim();
  const connectionName = input.connectionName.trim();
  const displayName = input.displayName.trim();
  if (!accountName || !connectionName || !displayName || displayName.length > 80) {
    return { ok: false, message: "Ingresá un nombre de hasta 80 caracteres." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const { error } = await supabase.rpc("rename_ninja_broker_account", {
    target_account_name: accountName,
    target_connection_name: connectionName,
    target_display_name: displayName,
  });
  if (error) return { ok: false, message: "No se pudo guardar el nombre." };

  revalidatePath("/app");
  return { ok: true, message: "Nombre guardado." };
}

export async function claimBrokerAccount(input: Readonly<{
  accountName: string;
  connectionName: string;
  physicalConnectorId: string;
}>): Promise<ActionResult> {
  const accountName = input.accountName.trim();
  const connectionName = input.connectionName.trim();
  if (!isUuid(input.physicalConnectorId) || !accountName || !connectionName) {
    return { ok: false, message: "La cuenta broker detectada no es válida." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("claim_ninja_broker_account", {
    target_account_name: accountName,
    target_connection_name: connectionName,
    target_physical_connector_id: input.physicalConnectorId,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("not available")
        ? "La cuenta ya no está disponible para confirmar. Actualizá el panel."
        : "No se pudo confirmar la cuenta broker.",
    };
  }
  revalidatePath("/app");
  return { ok: true, message: `Cuenta broker ${accountName} confirmada para tu espacio NODAL.` };
}
