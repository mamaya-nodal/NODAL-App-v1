import { describe, expect, it } from "vitest";

import { formatNodalUserIdentifier } from "./nodal-identifiers";

describe("formatNodalUserIdentifier", () => {
  it("formats main and dependent desk identifiers", () => {
    expect(formatNodalUserIdentifier("nd", "mp", 3)).toBe("USERND-MP-03");
    expect(formatNodalUserIdentifier("HW", "M03", 1)).toBe("USERHW-M03-01");
  });

  it("keeps correlatives wider than two digits", () => {
    expect(formatNodalUserIdentifier("ND", "M101", 125)).toBe("USERND-M101-125");
  });

  it("rejects malformed identity components", () => {
    expect(() => formatNodalUserIdentifier("NODAL", "MP", 1)).toThrow("INVALID_UNIT_CODE");
    expect(() => formatNodalUserIdentifier("ND", "M1", 1)).toThrow("INVALID_DESK_CODE");
    expect(() => formatNodalUserIdentifier("ND", "MP", 0)).toThrow("INVALID_MEMBER_NUMBER");
  });
});
