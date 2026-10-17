import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
    rpc: mocks.rpc,
  }),
}));

import { createNinjaPairingCode } from "./ninja-connector-actions";

describe("pairing code expiration contract", () => {
  it("generates a code within the database expiration limit", async () => {
    const sql = readFileSync("supabase/migrations/20260923120000_identity_scoped_ninja_connectors.sql", "utf8");
    const limit = sql.match(/target_expires_at > now\(\) \+ interval '(\d+) minutes'/);
    expect(limit).not.toBeNull();
    const maxLifetimeMs = Number(limit![1]) * 60_000;
    mocks.rpc.mockImplementation(async (_name, args) => {
      const remaining = Date.parse(args.target_expires_at) - Date.now();
      return { error: remaining > 0 && remaining <= maxLifetimeMs ? null : { message: "Invalid pairing expiration" } };
    });
    const result = await createNinjaPairingCode(null, {});
    expect(result.error).toBeUndefined();
    expect(result.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("create_ninja_pairing_code", expect.objectContaining({ target_identity_id: null }));
  });
});
