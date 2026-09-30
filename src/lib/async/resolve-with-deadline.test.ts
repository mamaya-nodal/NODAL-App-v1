import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveWithDeadline } from "./resolve-with-deadline";

afterEach(() => vi.useRealTimers());

describe("resolveWithDeadline", () => {
  it("returns the task result when it finishes in time", async () => {
    await expect(resolveWithDeadline(Promise.resolve("ready"), 1_000, () => "recovery"))
      .resolves.toBe("ready");
  });

  it("returns a recovery result instead of waiting forever", async () => {
    vi.useFakeTimers();
    const neverFinishes = new Promise<string>(() => undefined);
    const result = resolveWithDeadline(neverFinishes, 20_000, () => "recovery");

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toBe("recovery");
  });
});
