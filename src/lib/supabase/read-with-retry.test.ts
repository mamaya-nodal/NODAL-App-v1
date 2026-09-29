import { afterEach, describe, expect, it, vi } from "vitest";
import { readWithRetry } from "./read-with-retry";

afterEach(() => vi.useRealTimers());

describe("readWithRetry", () => {
  it("recovers a rejected JWT without replacing an active profile with null", async () => {
    vi.useFakeTimers();
    const read = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST301" } })
      .mockResolvedValue({ data: { access_state: "active" }, error: null });
    const pending = readWithRetry(read);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ data: { access_state: "active" }, error: null });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(["PGRST301", "", "57014"])("preserves the final failure %s after bounded retries", async (code) => {
    vi.useFakeTimers();
    const failure = { data: null, error: { code } };
    const read = vi.fn().mockResolvedValue(failure);
    const pending = readWithRetry(read);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(failure);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not retry missing permissions or invent an empty successful result", async () => {
    const failure = { data: null, error: { code: "42501", status: 403 } };
    const read = vi.fn().mockResolvedValue(failure);
    expect(await readWithRetry(read)).toEqual(failure);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("accepts a verified absence of a connector", async () => {
    const read = vi.fn().mockResolvedValue({ data: [], error: null });
    expect(await readWithRetry(read)).toEqual({ data: [], error: null });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("recovers a network exception", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue({ data: ["active connector"], error: null });
    const pending = readWithRetry(read);
    await vi.runAllTimersAsync();
    expect((await pending).error).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
