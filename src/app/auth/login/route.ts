import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/app";
  const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("next", next);
  const redirectTo = callbackUrl.toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/auth/error", request.nextUrl.origin));
  }

  return NextResponse.redirect(data.url);
}
