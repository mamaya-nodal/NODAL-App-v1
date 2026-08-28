import { bearerToken, refreshNinjaConnector } from "@/modules/ninja/server/connector-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await refreshNinjaConnector(bearerToken(request) ?? "");
  return Response.json(
    session ?? { error: "La autorización del conector venció o fue revocada." },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: session ? 200 : 401 },
  );
}
