import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMasterControl, runAccountingDiagnosticForOwner } = vi.hoisted(() => ({
  loadMasterControl: vi.fn(),
  runAccountingDiagnosticForOwner: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ service: true }) }));
vi.mock("@/modules/admin/server/load-master-control", () => ({ loadMasterControl }));
vi.mock("./run-accounting-diagnostic", () => ({ runAccountingDiagnosticForOwner }));

import { runDeterministicNodalitoQuery } from "./run-deterministic-query";

function masterData() {
  return {
    excludedFromMasterReportingUserIds: [],
    historicalGrossByUser: { david: 0 },
    month: "2026-10-01",
    operationalDetailByUser: {
      david: {
        accounts: [],
        alerts: [],
        floatingInCents: 0,
        lastOperatedOn: null,
        pendingPayouts: [],
        performance: [],
      },
    },
    overview: {
      gross: 0,
      people: [{
        access: "active",
        commission: 0,
        currentGrossInCents: 0,
        email: "david.zabaleta.1999@gmail.com",
        gross: 0,
        id: "david",
        name: "David Johel Zabaleta Mallqui",
      }],
    },
    performanceHistory: [],
    traderLiveStatusByUser: {
      david: { light: "green", message: "Conector actualizado y transmitiendo." },
    },
  };
}

describe("investigación Admin Master de Nodalito", () => {
  beforeEach(() => {
    loadMasterControl.mockReset().mockResolvedValue(masterData());
    runAccountingDiagnosticForOwner.mockReset();
  });

  it("incorpora la auditoría profunda del usuario mencionado", async () => {
    runAccountingDiagnosticForOwner.mockResolvedValue([{
      category: "reconciliation",
      detail: "No se pudieron vincular 5 cuentas.",
      evidence: "Lote sin período asignado.",
      id: "unreconciled:batch-orphan",
      severity: "critical",
      title: "Operación detectada sin período contable",
      userId: null,
      userName: null,
    }]);

    const result = await runDeterministicNodalitoQuery(
      "Revisá los problemas de conciliación de David",
      new Date("2026-11-09T15:00:00Z"),
    );

    expect(runAccountingDiagnosticForOwner).toHaveBeenCalledWith(
      { service: true },
      "david",
      { now: new Date("2026-11-09T15:00:00Z"), recentOperationDays: 45 },
    );
    expect(result.coverageComplete).toBe(true);
    expect(result.findings).toMatchObject([{
      id: "unreconciled:batch-orphan",
      userId: "david",
      userName: "David Johel Zabaleta Mallqui",
    }]);
  });

  it("no emite un falso resultado sano si falla una fuente profunda", async () => {
    runAccountingDiagnosticForOwner.mockRejectedValue(new Error("database_unavailable"));
    const result = await runDeterministicNodalitoQuery(
      "Revisá los problemas de conciliación de David",
      new Date("2026-11-09T15:00:00Z"),
    );
    expect(result.coverageComplete).toBe(false);
    expect(result.summary).toContain("no puedo confirmar");
  });
});
