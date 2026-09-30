import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedEnvironments = new Set(["local", "preview", "production"]);

function getEnvironment() {
  const environment = process.env.NEXT_PUBLIC_APP_ENV ?? "unknown";

  return allowedEnvironments.has(environment) ? environment : "unknown";
}

async function probeDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return { database: "unconfigured" as const, databaseLatencyMs: null };
  }

  const startedAt = performance.now();
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client
    .from("nodal_users")
    .select("id", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(8_000));

  return {
    database: error ? "unavailable" as const : "ok" as const,
    databaseLatencyMs: Math.round(performance.now() - startedAt),
  };
}

export async function GET(request?: Request) {
  const shouldProbeDatabase = request
    ? new URL(request.url).searchParams.get("database") === "1"
    : false;
  const databaseHealth = shouldProbeDatabase
    ? await probeDatabase()
    : undefined;

  return NextResponse.json(
    {
      status: "ok",
      environment: getEnvironment(),
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      checkedAt: new Date().toISOString(),
      ...(databaseHealth ?? {}),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
