import { describe, expect, it } from "vitest";

import { buildIdentityReviewRevision } from "./identity-review-revision";

describe("identity review revision", () => {
  it("only changes for submitted requests and remains stable across query order", () => {
    expect(buildIdentityReviewRevision([
      { id: "request-b", status: "submitted" },
      { id: "request-sent", status: "sent" },
      { id: "request-a", status: "submitted" },
    ])).toBe("request-a|request-b");

    expect(buildIdentityReviewRevision([
      { id: "request-a", status: "submitted" },
      { id: "request-b", status: "submitted" },
    ])).toBe("request-a|request-b");
  });
});

