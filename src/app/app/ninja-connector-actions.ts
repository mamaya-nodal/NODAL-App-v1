"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function revokeNinjaConnector(formData: FormData) {
  const supabase = await createClient();
  const connectorId = String(formData.get("connector_id") ?? "");
  if (!isUuid(connectorId)) return;
  await supabase.rpc("revoke_ninja_connector", {
    management_reason: "Desvinculación solicitada por el usuario",
    target_connector_id: connectorId,
  });
  revalidatePath("/app");
}
