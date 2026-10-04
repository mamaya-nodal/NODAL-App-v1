import { describe, expect, it } from "vitest";

import { prepareSupportTicket, supportCategoryLabel } from "./support-ticket";

describe("support ticket", () => {
  it("normalizes a valid ticket", () => {
    expect(prepareSupportTicket({
      category: "technical",
      description: "  El conector no actualiza el saldo desde esta mañana.  ",
      subject: "  Conector   sin señal  ",
    })).toEqual({
      category: "technical",
      description: "El conector no actualiza el saldo desde esta mañana.",
      subject: "Conector sin señal",
    });
  });

  it("rejects invalid categories and short content", () => {
    expect(prepareSupportTicket({ category: "billing", description: "Descripción suficientemente larga", subject: "Consulta" })).toBeNull();
    expect(prepareSupportTicket({ category: "other", description: "Muy corta", subject: "Consulta" })).toBeNull();
  });

  it("provides the visible category label", () => {
    expect(supportCategoryLabel("accounting")).toBe("Contabilidad");
  });
});
