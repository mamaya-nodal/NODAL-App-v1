import { describe, expect, it } from "vitest";

import {
  accountingPeriodMonthAt,
  clampDateToPeriodSchedule,
  cutoffFridayForMonth,
  dateBelongsToPeriodSchedule,
  firstMondayOfMonth,
  openingMondayForMonth,
  periodSchedule,
} from "./period-calendar";

describe("calendario contable NODAL", () => {
  it("toma el primer lunes aunque sea feriado", () => {
    expect(firstMondayOfMonth(2026, 9)).toBe("2026-10-05");
    expect(firstMondayOfMonth(2026, 10)).toBe("2026-11-02");
  });

  it("elige el viernes alrededor del día 15 según la regla comercial", () => {
    // Lunes y martes cierran el viernes anterior.
    expect(cutoffFridayForMonth(2027, 1)).toBe("2027-02-12");
    expect(cutoffFridayForMonth(2026, 11)).toBe("2026-12-11");
    // Miércoles y jueves cierran el viernes siguiente.
    expect(cutoffFridayForMonth(2026, 3)).toBe("2026-04-17");
    expect(cutoffFridayForMonth(2026, 0)).toBe("2026-01-16");
    // Viernes cierra ese mismo día; sábado y domingo, el anterior.
    expect(cutoffFridayForMonth(2027, 0)).toBe("2027-01-15");
    expect(cutoffFridayForMonth(2026, 7)).toBe("2026-08-14");
    expect(cutoffFridayForMonth(2026, 10)).toBe("2026-11-13");
    expect(openingMondayForMonth(2026, 10)).toBe("2026-11-16");
  });

  it("mantiene octubre hasta el corte del viernes 13 de noviembre a las 19", () => {
    expect(accountingPeriodMonthAt(new Date("2026-11-13T21:59:59Z"))).toBe("2026-10-01");
    expect(accountingPeriodMonthAt(new Date("2026-11-13T22:00:00Z"))).toBe("2026-11-01");
  });

  it("programa noviembre y diciembre alrededor del día 15", () => {
    expect(periodSchedule("2026-11-01")).toEqual({
      operationalStartOn: "2026-11-16",
      scheduledCloseAt: "2026-12-11T19:00:00-03:00",
    });
    expect(periodSchedule("2026-12-01")).toEqual({
      operationalStartOn: "2026-12-14",
      scheduledCloseAt: "2027-01-15T19:00:00-03:00",
    });
  });

  it("incluye los primeros días del mes siguiente en el período que está cerrando", () => {
    expect(dateBelongsToPeriodSchedule(
      "2026-12-11",
      "2026-11-16",
      "2026-12-11T19:00:00-03:00",
    )).toBe(true);
    expect(dateBelongsToPeriodSchedule(
      "2026-11-15",
      "2026-11-16",
      "2026-12-11T19:00:00-03:00",
    )).toBe(false);
  });

  it("propone una fecha válida cuando el período ya cambió pero todavía no comenzó a operar", () => {
    expect(clampDateToPeriodSchedule(
      "2026-11-15",
      "2026-11-16",
      "2026-12-11T19:00:00-03:00",
    )).toBe("2026-11-16");
    expect(clampDateToPeriodSchedule(
      "2026-11-20",
      "2026-11-16",
      "2026-12-11T19:00:00-03:00",
    )).toBe("2026-11-20");
    expect(clampDateToPeriodSchedule(
      "2026-12-12",
      "2026-11-16",
      "2026-12-11T19:00:00-03:00",
    )).toBe("2026-12-11");
  });
});
