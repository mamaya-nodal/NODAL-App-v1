import { describe, expect, it } from "vitest";

import { knowledgeForRole } from "./knowledge-access";

describe("knowledgeForRole", () => {
  it("no entrega conocimiento confidencial a un trader", () => {
    expect(knowledgeForRole("trader").some((document) => document.id === "policy:master-audit")).toBe(false);
  });

  it("habilita la política global únicamente para Admin Master", () => {
    expect(knowledgeForRole("admin").some((document) => document.id === "policy:master-audit")).toBe(false);
    expect(knowledgeForRole("master").some((document) => document.id === "policy:master-audit")).toBe(true);
  });
});
