import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("informa disponibilidad sin revelar configuracion privada", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(body.status).toBe("ok");
    expect(body.environment).toMatch(/^(local|preview|production|unknown)$/);
    expect(typeof body.checkedAt).toBe("string");
    expect(JSON.stringify(body)).not.toContain("SUPABASE");
  });
});
