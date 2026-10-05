import { describe, expect, it } from "vitest";

import {
  canOpenDeskAdmin,
  canOpenMasterAdmin,
  parseAdministrationScope,
  visibleAdministrationScope,
} from "./administration-scope";

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

  it("keeps desk and Master as cumulative capabilities", () => {
    const combined = parseAdministrationScope({
      desk_id: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      desk_name: "Mesa Ivo",
      scope: "combined",
    });
    expect(combined).toEqual({
      deskId: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      deskName: "Mesa Ivo",
      kind: "combined",
    });
    expect(canOpenDeskAdmin(combined)).toBe(true);
    expect(canOpenMasterAdmin(combined)).toBe(true);
  });

  it("allows the exceptional panel preview without inventing a desk", () => {
    const preview = parseAdministrationScope({
      desk_id: null,
      desk_name: null,
      scope: "master_preview",
    });
    expect(preview).toEqual({ kind: "preview" });
    expect(canOpenDeskAdmin(preview)).toBe(true);
    expect(canOpenMasterAdmin(preview)).toBe(true);
  });

  it("fails closed when the database response is incomplete or unknown", () => {
    expect(parseAdministrationScope(null)).toEqual({ kind: "none" });
    expect(parseAdministrationScope({ desk_id: null, desk_name: "Mesa", scope: "desk" }))
      .toEqual({ kind: "none" });
    expect(parseAdministrationScope({ desk_id: null, desk_name: null, scope: "other" }))
      .toEqual({ kind: "none" });
  });

  it("shows the Master entry before MFA without granting protected access", () => {
    expect(visibleAdministrationScope("admin", { kind: "none" }))
      .toEqual({ kind: "master" });
    expect(visibleAdministrationScope("student", { kind: "none" }))
      .toEqual({ kind: "none" });
  });

  it("promotes a protected desk capability to the combined navigation for Master", () => {
    expect(visibleAdministrationScope("admin", {
      deskId: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      deskName: "Mesa Ivo",
      kind: "desk",
    })).toEqual({
      deskId: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      deskName: "Mesa Ivo",
      kind: "combined",
    });
  });

  it("keeps desk administration for a student manager", () => {
    const desk = {
      deskId: "1660185d-9f28-4bf0-b931-b8f25eef5580",
      deskName: "Mesa Carlos",
      kind: "desk" as const,
    };
    expect(visibleAdministrationScope("student", desk)).toEqual(desk);
  });
});

