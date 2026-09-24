import { describe, expect, it } from "vitest";

import { resolveBrokerAccountAliasView } from "./broker-account-alias-view";

describe("resolveBrokerAccountAliasView", () => {
  it("keeps unnamed broker accounts in edit mode", () => {
    expect(resolveBrokerAccountAliasView({ editing: false })).toEqual({ editing: true, name: "" });
  });

  it("shows a saved name in read mode", () => {
    expect(resolveBrokerAccountAliasView({ editing: false, persistedName: "Cobertura 1" }))
      .toEqual({ editing: false, name: "Cobertura 1" });
  });

  it("uses the just-saved name before the refreshed server data arrives", () => {
    expect(resolveBrokerAccountAliasView({
      editing: false,
      optimisticName: "  Identidad Alfred  ",
      persistedName: "Cobertura anterior",
    })).toEqual({ editing: false, name: "Identidad Alfred" });
  });

  it("returns to edit mode when requested", () => {
    expect(resolveBrokerAccountAliasView({ editing: true, persistedName: "Cobertura 1" }))
      .toEqual({ editing: true, name: "Cobertura 1" });
  });
});
