import { describe, expect, it } from "vitest";
import {
  diagnoseBalanceChains,
  diagnoseClosedAccountLinks,
  diagnoseCommittedBatchCoverage,
  diagnoseControlLedgers,
  diagnoseOperationalBaselines,
  diagnosePendingBrokerEvents,
  diagnoseUnbatchedLinkedSessions,
  diagnoseUnreconciledBatches,
} from "./accounting-diagnostic";

describe("auditoría contable determinística de Nodalito", () => {
  it("encuentra un corte de saldo que encadenaría mal el flotante", () => {
    expect(diagnoseBalanceChains([
      { id: "a", period_id: "p", control_number: 1, balance_before_cents: 100, balance_after_cents: 90, operating_result_cents: -10 },
      { id: "b", period_id: "p", control_number: 2, balance_before_cents: 95, balance_after_cents: 105, operating_result_cents: 10 },
    ])).toMatchObject([{ id: "balance-chain:p:b", severity: "critical" }]);
  });

  it("valida la distribución y los asientos de cada cuenta", () => {
    const controls = [{ id: "c", period_id: "p", control_number: 1, balance_before_cents: 100, balance_after_cents: 90, operating_result_cents: -10 }];
    expect(diagnoseControlLedgers(controls,
      [{ daily_control_id: "c", account_id: "one", allocated_result_cents: -10 }],
      [{ daily_control_id: "c", account_id: "one", destination: "NETO BROKER -", magnitude_cents: 9 }],
    ).map((finding) => finding.id)).toEqual(["control-entries:c"]);
    expect(diagnoseControlLedgers(controls,
      [{ daily_control_id: "c", account_id: "one", allocated_result_cents: -8 }],
      [{ daily_control_id: "c", account_id: "one", destination: "NETO BROKER -", magnitude_cents: 8 }],
    ).map((finding) => finding.id)).toEqual(["control-allocation:c"]);
    expect(diagnoseControlLedgers(controls,
      [{ daily_control_id: "c", account_id: "one", allocated_result_cents: -9 }],
      [{ daily_control_id: "c", account_id: "one", destination: "NETO BROKER -", magnitude_cents: 9 }],
    ).map((finding) => finding.id)).toEqual([]);
  });

  it("encuentra cuentas omitidas en un lote ya conciliado", () => {
    expect(diagnoseCommittedBatchCoverage(
      [{ id: "batch", daily_control_id: "control" }],
      [{ batch_id: "batch", account_id: "one", role: "prop" }, { batch_id: "batch", account_id: "two", role: "prop" }],
      [{ daily_control_id: "control", account_id: "one", destination: "NETO BROKER -", magnitude_cents: 10 }],
    )).toMatchObject([{ id: "batch-coverage:batch", severity: "critical" }]);
    expect(diagnoseCommittedBatchCoverage(
      [{ id: "batch", daily_control_id: "control" }],
      [{ batch_id: "batch", account_id: "one", role: "prop" }],
      [
        { daily_control_id: "control", account_id: "one", destination: "NETO BROKER -", magnitude_cents: 10 },
        { daily_control_id: "control", account_id: "manual", destination: "NETO BROKER -", magnitude_cents: 10 },
      ],
    )).toEqual([]);
  });

  it("distingue una base faltante de una etapa incompatible", () => {
    expect(diagnoseOperationalBaselines([
      { account_id: "one", external_account_name: "A-1", phase: "Evaluation", accounting_phase: null, completed_trade_days: null },
      { account_id: "two", external_account_name: "A-2", phase: "Funded", accounting_phase: "Evaluacion", completed_trade_days: 1 },
    ]).map((finding) => finding.id)).toEqual(["account-baseline:one", "account-phase:two"]);
  });

  it("detecta una cuenta cerrada que conserva un vínculo Ninja activo", () => {
    expect(diagnoseClosedAccountLinks([
      { account_id: "closed", account_state: "closed", closed_at: null, external_account_name: "LFE-01" },
      { account_id: "open", account_state: "active", closed_at: null, external_account_name: "LFE-02" },
      { account_id: "historic", account_state: "closed", closed_at: "2026-11-10T12:00:00Z", external_account_name: "LFE-03" },
    ])).toMatchObject([{ id: "closed-account-active-link:closed", severity: "critical" }]);
  });

  it("sólo denuncia sesiones vinculadas sin lote", () => {
    const sessions = [{ id: 10, account_name: "A-1", connection_name: "Ninja", execution_count: 2, opened_at: "2026-11-07T10:00:00Z" }];
    expect(diagnoseUnbatchedLinkedSessions(sessions, new Set())).toMatchObject([{ id: "unbatched-session:10" }]);
    expect(diagnoseUnbatchedLinkedSessions(sessions, new Set([10]))).toEqual([]);
  });

  it("no oculta un lote bloqueado por carecer de período contable", () => {
    const findings = diagnoseUnreconciledBatches([{
      accounting_blocking_reason: "No se pudieron vincular 5 cuentas.",
      accounting_period_id: null,
      accounting_status: "blocked",
      id: "batch-orphan",
      opened_at: "2026-11-09T14:38:23.781Z",
      status: "ready",
    }], new Date("2026-11-09T15:00:00Z"));
    expect(findings).toMatchObject([{
      id: "unreconciled:batch-orphan",
      severity: "critical",
      title: "Operación detectada sin período contable",
    }]);
    expect(findings[0].evidence).toContain("sin período asignado");
  });

  it("agrupa los eventos broker pendientes sin ocultarlos", () => {
    const findings = diagnosePendingBrokerEvents([
      { connector_id: "connector", id: "one", observed_at: "2026-11-09T13:00:00Z" },
      { connector_id: "connector", id: "two", observed_at: "2026-11-09T14:00:00Z" },
    ], new Date("2026-11-09T15:00:00Z"));
    expect(findings).toMatchObject([{
      id: "pending-broker-events:connector",
      severity: "attention",
    }]);
    expect(findings[0].detail).toContain("2 lecturas");
  });
});
