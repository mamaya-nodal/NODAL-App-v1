import { describe, expect, it } from "vitest";

import {
  compareReconciliationChronology,
  currentAndPreviousMonthKeys,
  reconciliationPairLabel,
  reconciliationPosition,
  splitReconciliationMonthKeys,
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

  it("separa el mes vigente de los meses historicos", () => {
    expect(splitReconciliationMonthKeys(["2026-11", "2026-10"], "2026-11")).toEqual({
      current: ["2026-11"],
      archived: ["2026-10"],
    });
    expect(splitReconciliationMonthKeys(["2026-10"], "2026-11")).toEqual({
      current: [],
      archived: ["2026-10"],
    });
  });

  it("ordena conciliaciones automaticas y recuperadas en una sola cronologia descendente", () => {
    const rows = [
      { controlNumber: 17, id: "recovered-older", occurredAt: "2026-11-09T12:00:00-03:00", operatedOn: "2026-11-09" },
      { controlNumber: 20, id: "automatic-newer", occurredAt: "2026-11-10T18:25:00-03:00", operatedOn: "2026-11-10" },
      { controlNumber: 19, id: "recovered-newer", occurredAt: "2026-11-10T12:00:00-03:00", operatedOn: "2026-11-10" },
      { controlNumber: 18, id: "automatic-older", occurredAt: "2026-11-10T20:00:00-03:00", operatedOn: "2026-11-10" },
    ];

    expect(rows.sort(compareReconciliationChronology).map((row) => row.id)).toEqual([
      "automatic-newer",
      "recovered-newer",
      "automatic-older",
      "recovered-older",
    ]);
  });
});
