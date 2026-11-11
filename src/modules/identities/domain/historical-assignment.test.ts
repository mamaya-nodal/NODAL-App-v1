import { describe, expect, it } from "vitest";

import { identityAssignmentOnOperationalDay } from "./historical-assignment";

describe("identityAssignmentOnOperationalDay", () => {
  it("keeps the historical identity after the account is no longer assigned", () => {
    expect(identityAssignmentOnOperationalDay([{
      assignedAt: "2026-11-01T12:00:00.000Z",
      identityId: "david",
      unassignedAt: "2026-11-10T12:00:00.000Z",
    }], "2026-11-09")?.identityId).toBe("david");
  });

  it("does not attribute a personal operation to a later identity", () => {
    expect(identityAssignmentOnOperationalDay([{
      assignedAt: "2026-11-10T12:00:00.000Z",
      identityId: "gino",
      unassignedAt: null,
    }], "2026-11-09")).toBeNull();
  });
});
