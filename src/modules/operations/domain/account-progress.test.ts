import { describe, expect, it } from "vitest";

import {
  accountProgressLabel,
  resolveCurrentAccountProgress,
} from "./account-progress";

const entry = (dailyControlId: string, phase: "Evaluacion" | "Primera vuelta" | "Segunda vuelta") => ({
  dailyControlId,
  phase,
});

describe("progreso operativo de una cuenta", () => {
  it("presenta Evaluación Día 1 antes del primer trade", () => {
    const progress = resolveCurrentAccountProgress({ entries: [], operationalState: "Evaluation", payouts: [] });
    expect(accountProgressLabel(progress)).toBe("Evaluación Día 1");
  });

  it("avanza un día por trade cerrado aunque ocurran en la misma fecha", () => {
    const progress = resolveCurrentAccountProgress({
      entries: [entry("trade-1", "Evaluacion"), entry("trade-2", "Evaluacion")],
      operationalState: "Evaluation",
      payouts: [],
    });
    expect(progress).toEqual({ phase: "Evaluacion", tradeDay: 3 });
  });

  it("refleja un trade técnico cerrado aunque su conciliación siga pendiente", () => {
    expect(resolveCurrentAccountProgress({
      entries: [],
      observedClosedTradeCount: 1,
      operationalState: "Evaluation",
      payouts: [],
    })).toEqual({ phase: "Evaluacion", tradeDay: 2 });
  });

  it("cuenta una cobertura con varias entradas como un solo trade", () => {
    const progress = resolveCurrentAccountProgress({
      entries: [entry("trade-1", "Evaluacion"), entry("trade-1", "Evaluacion")],
      operationalState: "Evaluation",
      payouts: [],
    });
    expect(progress.tradeDay).toBe(2);
  });

  it("no limita Evaluación a cuatro trades ni una vuelta a seis", () => {
    const evaluation = resolveCurrentAccountProgress({
      entries: Array.from({ length: 20 }, (_, index) => entry(`evaluation-${index}`, "Evaluacion")),
      operationalState: "Evaluation",
      payouts: [],
    });
    const funded = resolveCurrentAccountProgress({
      entries: Array.from({ length: 8 }, (_, index) => entry(`funded-${index}`, "Primera vuelta")),
      operationalState: "Funded",
      payouts: [],
    });
    expect(evaluation.tradeDay).toBe(21);
    expect(funded.tradeDay).toBe(9);
  });

  it("inicia Primera vuelta Día 1 al pasar a Funded", () => {
    expect(resolveCurrentAccountProgress({
      entries: [entry("evaluation-1", "Evaluacion")],
      operationalState: "Funded",
      payouts: [],
    })).toEqual({ phase: "Primera vuelta", tradeDay: 1 });
  });

  it("cada payout aprobado cierra su vuelta y abre la siguiente en Día 1", () => {
    const progress = resolveCurrentAccountProgress({
      entries: [entry("funded-1", "Primera vuelta"), entry("funded-2", "Primera vuelta")],
      observedClosedTradeCount: 9,
      operationalState: "Funded",
      payouts: [{ phase: "Primera vuelta" }],
    });
    expect(progress).toEqual({ phase: "Segunda vuelta", tradeDay: 1 });

    expect(resolveCurrentAccountProgress({
      entries: [...Array.from({ length: 2 }, (_, index) => entry(`funded-${index}`, "Primera vuelta")), entry("second-1", "Segunda vuelta")],
      operationalState: "Funded",
      payouts: [{ phase: "Primera vuelta" }, { phase: "Segunda vuelta" }],
    })).toEqual({ phase: "Tercera vuelta", tradeDay: 1 });
  });

  it("conserva la vuelta al cambiar el estado operativo a Live", () => {
    expect(resolveCurrentAccountProgress({
      entries: [entry("second-1", "Segunda vuelta")],
      operationalState: "Live",
      payouts: [],
    })).toEqual({ phase: "Segunda vuelta", tradeDay: 2 });
  });
});
