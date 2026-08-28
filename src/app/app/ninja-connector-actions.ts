"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function createNinjaPairingCode(): Promise<PairingCodeState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Volvé a iniciar sesión para vincular NinjaTrader." };

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await supabase.rpc("create_ninja_pairing_code", {
    target_code_hash: hashConnectorSecret(code),
    target_expires_at: expiresAt,
  });
  if (error) return { error: "No se pudo generar el código. Intentá nuevamente." };

  return {
    code: `${code.slice(0, 4)}-${code.slice(4)}`,
    expiresAt,
  };
}

export async function revokeNinjaConnector() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_current_ninja_connector", {
    management_reason: "Desvinculación solicitada por el usuario",
  });
  revalidatePath("/app");
  redirect(`/app?connector_result=${error ? "not_revoked" : "revoked"}`);
}
