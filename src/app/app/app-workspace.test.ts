import { describe, expect, it } from "vitest";

import { availableWorkspaceViews } from "./app-workspace";

describe("workspace capabilities", () => {
  it("removes Identidades and Configuracion when Admin Master disabled them", () => {
    expect(availableWorkspaceViews({
      configurationEnabled: false,
      identitiesEnabled: false,
    }).map((view) => view.value)).toEqual([
      "home",
      "accounts",
      "operations",
      "accounting",
    ]);
  });

  it("shows each optional section only when its capability is enabled", () => {
    expect(availableWorkspaceViews({
      configurationEnabled: true,
      identitiesEnabled: false,
    }).map((view) => view.value)).toContain("configuration");
    expect(availableWorkspaceViews({
      configurationEnabled: false,
      identitiesEnabled: true,
    }).map((view) => view.value)).toContain("identities");
  });
});
