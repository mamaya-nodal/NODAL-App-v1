import { describe, expect, it } from "vitest";

import { simplifiedOpeningBaseline } from "./simplified-opening-policy";

describe("simplified opening policy", () => {
  it("does not register accounts or floating during opening", () => {
    expect(simplifiedOpeningBaseline()).toEqual({
      accounts: [],
      floatingInCents: 0,
    });
  });
});
