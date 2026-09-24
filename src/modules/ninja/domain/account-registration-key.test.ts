import { describe, expect, it } from "vitest";

import { ninjaAccountRegistrationKey } from "./account-registration-key";

describe("ninjaAccountRegistrationKey", () => {
  it("keeps equal account names independent across connectors", () => {
    expect(ninjaAccountRegistrationKey("connector-a", "Lucid", "123"))
      .not.toBe(ninjaAccountRegistrationKey("connector-b", "Lucid", "123"));
  });

  it("normalizes surrounding whitespace without changing identity casing", () => {
    expect(ninjaAccountRegistrationKey(" connector-a ", " Lucid Lupe ", " FTMO123 "))
      .toBe(ninjaAccountRegistrationKey("connector-a", "Lucid Lupe", "FTMO123"));
    expect(ninjaAccountRegistrationKey("connector-a", "Lucid Lupe", "FTMO123"))
      .not.toBe(ninjaAccountRegistrationKey("connector-a", "lucid lupe", "FTMO123"));
  });
});
