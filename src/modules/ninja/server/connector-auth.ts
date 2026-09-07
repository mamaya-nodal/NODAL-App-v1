import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const accessLifetimeMs = 10 * 60 * 1000;
const refreshLifetimeMs = 90 * 24 * 60 * 60 * 1000;

export type ConnectorSession = Readonly<{
  accessExpiresAt: string;
  accessToken: string;
  connectorId: string;
  refreshExpiresAt: string;
  refreshToken: string;
}>;

export type AuthenticatedConnector = Readonly<{
  connectorId: string;
  ownerUserId: string;
}>;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashConnectorSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function newSessionValues(now = new Date()) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  return {
    accessExpiresAt: new Date(now.getTime() + accessLifetimeMs).toISOString(),
    accessToken,
    refreshExpiresAt: new Date(now.getTime() + refreshLifetimeMs).toISOString(),
    refreshToken,
  };
}

function firstRow(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? (value[0] as Record<string, unknown>)
    : null;
}

export async function pairNinjaConnector(code: string, connectorVersion: string): Promise<ConnectorSession | null> {
  const normalizedCode = normalizePairingCode(code);
  const cleanVersion = connectorVersion.trim();
  if (normalizedCode.length !== 8 || !cleanVersion || cleanVersion.length > 40) return null;

  const supabase = serviceClient();
  if (!supabase) return null;
  const session = newSessionValues();
  const { data, error } = await supabase.rpc("redeem_ninja_pairing_code", {
    target_access_expires_at: session.accessExpiresAt,
    target_access_token_hash: hashConnectorSecret(session.accessToken),
    target_code_hash: hashConnectorSecret(normalizedCode),
    target_connector_version: cleanVersion,
    target_refresh_expires_at: session.refreshExpiresAt,
    target_refresh_token_hash: hashConnectorSecret(session.refreshToken),
  });
  const row = error ? null : firstRow(data);
  const connectorId = typeof row?.connector_id === "string" ? row.connector_id : null;
  return connectorId ? { ...session, connectorId } : null;
}

export async function refreshNinjaConnector(refreshToken: string): Promise<ConnectorSession | null> {
  if (!refreshToken || refreshToken.length > 256) return null;
  const supabase = serviceClient();
  if (!supabase) return null;
  const session = newSessionValues();
  const { data, error } = await supabase.rpc("refresh_ninja_connector_session", {
    target_access_expires_at: session.accessExpiresAt,
    target_access_token_hash: hashConnectorSecret(session.accessToken),
    target_new_refresh_token_hash: hashConnectorSecret(session.refreshToken),
    target_refresh_expires_at: session.refreshExpiresAt,
    target_refresh_token_hash: hashConnectorSecret(refreshToken),
  });
  const row = error ? null : firstRow(data);
  const connectorId = typeof row?.connector_id === "string" ? row.connector_id : null;
  return connectorId ? { ...session, connectorId } : null;
}

export async function authenticateNinjaConnector(accessToken: string | null): Promise<AuthenticatedConnector | null> {
  if (!accessToken || accessToken.length > 256) return null;
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("authenticate_ninja_connector_access", {
    target_access_token_hash: hashConnectorSecret(accessToken),
  });
  const row = error ? null : firstRow(data);
  return typeof row?.connector_id === "string" && typeof row.owner_user_id === "string"
    ? { connectorId: row.connector_id, ownerUserId: row.owner_user_id }
    : null;
}

export async function rememberNinjaConnectorVersion(connectorId: string, connectorVersion: unknown) {
  if (typeof connectorVersion !== "string") return;
  const cleanVersion = connectorVersion.trim();
  if (!/^[0-9A-Za-z._-]{1,40}$/.test(cleanVersion)) return;
  const supabase = serviceClient();
  if (!supabase) return;
  await supabase.from("ninja_connectors").update({ connector_version: cleanVersion }).eq("id", connectorId);
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}
