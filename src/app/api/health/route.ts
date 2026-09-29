import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedEnvironments = new Set(["local", "preview", "production"]);

function getEnvironment() {
  const environment = process.env.NEXT_PUBLIC_APP_ENV ?? "unknown";

  return allowedEnvironments.has(environment) ? environment : "unknown";
}

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      environment: getEnvironment(),
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
