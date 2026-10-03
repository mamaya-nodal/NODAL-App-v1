import { describe, expect, it } from "vitest";
import { DataReadError, requireReadData, requireSuccessfulReads } from "./require-read";

describe("required financial reads", () => {
  it("accepts verified zero balances and empty histories", () => {
    expect(requireReadData({ data: 0, error: null })).toBe(0);
    expect(requireReadData({ data: [], error: null })).toEqual([]);
  });
  it("rejects incomplete snapshots even when the other reads succeeded", () => {
    expect(() => requireSuccessfulReads([
      { data: [], error: null },
      { data: null, error: { message: "network failure" } },
    ])).toThrow(DataReadError);
  });
  it("does not interpret missing data or a partial response as zero", () => {
    expect(() => requireReadData({ data: null, error: null })).toThrow(DataReadError);
    expect(() => requireReadData({ data: 100, error: { message: "incomplete" } })).toThrow(DataReadError);
  });
});
