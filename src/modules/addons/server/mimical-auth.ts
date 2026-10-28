import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { MIMICAL_PRODUCT_KEY } from "../domain/mimical-pilot";

export class MimicalServiceUnavailable extends Error {
  constructor() { super("No se pudo verificar la licencia de MIMICAL."); }
}

type MimicalActivation = Readonly<{
  installationId: string;
  installationToken: string;
  ownerLabel: string;
}>;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function hashMimicalSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeMimicalCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function firstRow(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? value[0] as Record<string, unknown>
    : null;
}

export async function activateMimical(input: Readonly<{
  activationScope: "identity" | "personal";
  code: string;
  installationKey: string;
  mimicalVersion: string;
}>): Promise<MimicalActivation | null> {
  const code = normalizeMimicalCode(input.code);
  if (code.length !== 8 || !/^[0-9a-f-]{36}$/i.test(input.installationKey)) return null;
  if (!/^[0-9A-Za-z._-]{1,40}$/.test(input.mimicalVersion)) return null;
  if (input.activationScope !== "identity" && input.activationScope !== "personal") return null;
  const supabase = serviceClient();
  if (!supabase) throw new MimicalServiceUnavailable();
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase.rpc("redeem_scoped_addon_pairing_code", {
    target_activation_scope: input.activationScope,
    target_code_hash: hashMimicalSecret(code),
    target_installation_key: input.installationKey,
    target_installation_token_hash: hashMimicalSecret(token),
    target_product_key: MIMICAL_PRODUCT_KEY,
    target_version: input.mimicalVersion,
  });
  if (error) {
    if (error.code === "P0001") return null;
    console.error("MIMICAL_ACTIVATION_UNAVAILABLE", { code: error.code });
    throw new MimicalServiceUnavailable();
  }
  const row = firstRow(data);
  return typeof row?.installation_id === "string" && typeof row.owner_label === "string"
    ? { installationId: row.installation_id, installationToken: token, ownerLabel: row.owner_label }
    : null;
}

export async function validateMimical(token: string, installationKey: string) {
  if (!token || token.length > 256 || !/^[0-9a-f-]{36}$/i.test(installationKey)) return null;
  const supabase = serviceClient();
  if (!supabase) throw new MimicalServiceUnavailable();
  const { data, error } = await supabase.rpc("validate_addon_installation", {
    target_installation_key: installationKey,
    target_installation_token_hash: hashMimicalSecret(token),
    target_product_key: MIMICAL_PRODUCT_KEY,
  });
  if (error) {
    console.error("MIMICAL_VALIDATION_UNAVAILABLE", { code: error.code });
    throw new MimicalServiceUnavailable();
  }
  const row = firstRow(data);
  return typeof row?.installation_id === "string"
    ? { allowNewCycles: row.allow_new_cycles === true, ownerLabel: String(row.owner_label ?? "Usuario NODAL") }
    : null;
}
