"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ActionResult = Readonly<{ message: string; ok: boolean }>;

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
