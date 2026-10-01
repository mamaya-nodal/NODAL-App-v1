import { describe, expect, it } from "vitest";

import {
  currentAndPreviousMonthKeys,
  reconciliationPairLabel,
  reconciliationPosition,
} from "./reconciliation-view";

describe("vista de conciliaciones", () => {
  it("conserva solamente las claves del mes actual y el anterior, incluso en enero", () => {
    expect(currentAndPreviousMonthKeys(new Date(2027, 0, 15))).toEqual(["2027-01", "2026-12"]);
  });

  it("describe la posicion sin inventar direccion ni cantidad ausentes", () => {
    expect(reconciliationPosition("Short", 2, ["NQ DEC26"])).toBe("Short · 2 NQ DEC26");
    expect(reconciliationPosition(null, 0, [])).toBe("Sin instrumento");
  });

  it("presenta explicitamente el aparejamiento broker-prop", () => {
    expect(reconciliationPairLabel("2211575", ["LFE0009", "LFE0010"]))
      .toBe("2211575 ↔ LFE0009, LFE0010");
  });
});
