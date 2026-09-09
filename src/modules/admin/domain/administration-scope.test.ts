import { describe, expect, it } from "vitest";

import { parseAdministrationScope } from "./administration-scope";

describe("administration scope", () => {
  it("keeps Master administration separate from desk administration", () => {
    expect(parseAdministrationScope({ desk_id: null, desk_name: null, scope: "master" }))
      .toEqual({ kind: "master" });
  });

  it("grants only the identified managed desk", () => {
    expect(parseAdministrationScope({
      desk_id: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      desk_name: " Mesa Carlos ",
      scope: "desk",
    })).toEqual({
      deskId: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      deskName: "Mesa Carlos",
      kind: "desk",
    });
  });

  it("fails closed when the database response is incomplete or unknown", () => {
    expect(parseAdministrationScope(null)).toEqual({ kind: "none" });
    expect(parseAdministrationScope({ desk_id: null, desk_name: "Mesa", scope: "desk" }))
      .toEqual({ kind: "none" });
    expect(parseAdministrationScope({ desk_id: null, desk_name: null, scope: "other" }))
      .toEqual({ kind: "none" });
  });
});

