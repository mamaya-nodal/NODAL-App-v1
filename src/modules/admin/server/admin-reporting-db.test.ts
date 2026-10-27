import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  service: vi.fn(),
}));

vi.mock("./admin-access", () => ({ requireNodalAdmin: mocks.authorize }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }));

import { adminReportingDb } from "./admin-reporting-db";

describe("adminReportingDb", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.service.mockReset();
  });

  it("authorizes the Admin Master and then uses the privileged client for the consolidated report", async () => {
    const authorizedDb = { source: "session" };
    const serviceDb = { source: "service" };
    mocks.authorize.mockResolvedValue(authorizedDb);
    mocks.service.mockReturnValue(serviceDb);

    await expect(adminReportingDb(true)).resolves.toBe(serviceDb);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.service).toHaveBeenCalledOnce();
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.service.mock.invocationCallOrder[0],
    );
  });

  it("keeps the session-scoped client for non-consolidated administration reads", async () => {
    const authorizedDb = { source: "session" };
    mocks.authorize.mockResolvedValue(authorizedDb);

    await expect(adminReportingDb(false)).resolves.toBe(authorizedDb);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
