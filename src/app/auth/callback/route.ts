import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }

  return value;
}

export function authErrorPath(reason: "provider" | "session") {
  return `/auth/error?reason=${reason}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    console.error("[auth/callback] OAuth provider did not return an authorization code", {
      error: request.nextUrl.searchParams.get("error"),
    });

    return NextResponse.redirect(new URL(authErrorPath("provider"), request.nextUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }

  console.error("[auth/callback] OAuth code exchange failed", {
    code: error.code,
    message: error.message,
    status: error.status,
  });

  return NextResponse.redirect(new URL(authErrorPath("session"), request.nextUrl.origin));
}
