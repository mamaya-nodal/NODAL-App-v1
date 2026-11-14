import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTelemetryOrigins } from "./telemetry-origin";

it("uses authenticated stored origin and resolves only missing history from durable receipts", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ event_id: 2, physical_connector_id: "identity-pc" },
    { event_id: 3, physical_connector_id: null }], error: null });
  const origins = await resolveTelemetryOrigins({ rpc } as unknown as SupabaseClient,
    [{ id: 1, physical_connector_id: "personal-pc" }, { id: 2 }, { id: 3 }]);
  expect(rpc).toHaveBeenCalledWith("get_ninja_telemetry_origins", { target_event_ids: [2, 3] });
  expect([...origins]).toEqual([[1, "personal-pc"], [2, "identity-pc"]]);
});

it("does not hide an origin lookup failure as zero candidates", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "57014" } });
  await expect(resolveTelemetryOrigins({ rpc } as unknown as SupabaseClient, [{ id: 1 }])).rejects.toThrow("origen físico");
});
