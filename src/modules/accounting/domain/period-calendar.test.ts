import { describe, expect, it } from "vitest";

import {
  accountingPeriodMonthAt,
  clampDateToPeriodSchedule,
  dateBelongsToPeriodSchedule,
  firstMondayOfMonth,
  periodSchedule,
} from "./period-calendar";

describe("calendario contable NODAL", () => {
  it("toma el primer lunes aunque sea feriado", () => {
    expect(firstMondayOfMonth(2026, 9)).toBe("2026-10-05");
    expect(firstMondayOfMonth(2026, 10)).toBe("2026-11-02");
  });

  it("cierra septiembre el viernes 2 de octubre a las 19 de Buenos Aires", () => {
    expect(periodSchedule("2026-09-01")).toEqual({
      operationalStartOn: "2026-09-07",
      scheduledCloseAt: "2026-10-02T19:00:00-03:00",
    });
  });

  it("mantiene septiembre hasta el corte y cambia a octubre a las 19", () => {
    expect(accountingPeriodMonthAt(new Date("2026-10-02T21:59:59Z"))).toBe("2026-09-01");
    expect(accountingPeriodMonthAt(new Date("2026-10-02T22:00:00Z"))).toBe("2026-10-01");
  });

  it("mantiene octubre hasta el viernes anterior a la apertura de noviembre", () => {
    expect(periodSchedule("2026-10-01")).toEqual({
      operationalStartOn: "2026-10-05",
      scheduledCloseAt: "2026-10-30T19:00:00-03:00",
    });
    expect(accountingPeriodMonthAt(new Date("2026-10-30T21:59:59Z"))).toBe("2026-10-01");
    expect(accountingPeriodMonthAt(new Date("2026-10-30T22:00:00Z"))).toBe("2026-11-01");
  });

  it("incluye los primeros días del mes siguiente en el período que está cerrando", () => {
    expect(dateBelongsToPeriodSchedule(
      "2026-10-01",
      "2026-09-07",
      "2026-10-02T19:00:00-03:00",
    )).toBe(true);
    expect(dateBelongsToPeriodSchedule(
      "2026-10-04",
      "2026-10-05",
      "2026-10-30T19:00:00-03:00",
    )).toBe(false);
  });

  it("propone una fecha válida cuando el período ya cambió pero todavía no comenzó a operar", () => {
    expect(clampDateToPeriodSchedule(
      "2026-10-03",
      "2026-10-05",
      "2026-10-30T19:00:00-03:00",
    )).toBe("2026-10-05");
    expect(clampDateToPeriodSchedule(
      "2026-10-12",
      "2026-10-05",
      "2026-10-30T19:00:00-03:00",
    )).toBe("2026-10-12");
    expect(clampDateToPeriodSchedule(
      "2026-11-01",
      "2026-10-05",
      "2026-10-30T19:00:00-03:00",
    )).toBe("2026-10-30");
  });
});
