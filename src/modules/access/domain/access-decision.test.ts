import { describe, expect, it } from "vitest";

import { decideAccess } from "./access-decision";

describe("decideAccess", () => {
  it("separa identidad de autorización NODAL", () => {
    expect(decideAccess("google-user", null)).toBe("not_authorized");
  });

  it("permite únicamente al usuario activo coincidente", () => {
    expect(
      decideAccess("student-1", { id: "student-1", accessState: "active" }),
    ).toBe("allowed");
    expect(
      decideAccess("student-1", { id: "student-2", accessState: "active" }),
    ).toBe("not_authorized");
  });

  it("distingue una revocación", () => {
    expect(
      decideAccess("student-1", { id: "student-1", accessState: "revoked" }),
    ).toBe("revoked");
  });
});
