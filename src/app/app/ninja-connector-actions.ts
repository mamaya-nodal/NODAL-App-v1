"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hashConnectorSecret } from "@/modules/ninja/server/connector-auth";

export type PairingCodeState = Readonly<{
  code?: string;
  error?: string;
  expiresAt?: string;
}>;

const pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePairingCode(): string {
  return Array.from({ length: 8 }, () => pairingAlphabet[randomInt(pairingAlphabet.length)]).join("");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createNinjaPairingCode(
  targetIdentityId: string | null,
  previousState: PairingCodeState,
): Promise<PairingCodeState> {
  void previousState;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Volvé a iniciar sesión para vincular NinjaTrader." };
  if (targetIdentityId !== null && !isUuid(targetIdentityId)) {
    return { error: "La identidad seleccionada no es válida." };
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await supabase.rpc("create_ninja_pairing_code", {
    target_code_hash: hashConnectorSecret(code),
    target_expires_at: expiresAt,
    target_identity_id: targetIdentityId,
  });
  if (error) return { error: "No se pudo generar el código. Intentá nuevamente." };

  return {
    code: `${code.slice(0, 4)}-${code.slice(4)}`,
    expiresAt,
  };
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
