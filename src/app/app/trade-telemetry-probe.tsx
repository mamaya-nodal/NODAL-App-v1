"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buildNinjaOperationProbe, type NinjaTelemetryRow } from "@/modules/ninja/domain/operation-probe";
import { assignManualAccountsToCoverage } from "./coverage-assignment-actions";

type TechnicalOperationRow = Readonly<{
  account_name: string;
  closing_balance: number | string | null;
  connection_name: string;
  execution_count: number;
  id: number;
  instruments: string[];
  flat_at: string | null;
  last_event_at?: string;
  opened_at: string;
  opening_balance: number | string | null;
  result: number | string | null;
  settled_at: string | null;
  status: "closed" | "open" | "settling";
}>;

type AutomaticBatchRow = Readonly<{
  accounting_mode: "active" | "shadow";
  accounting_status: "blocked" | "committed" | "shadow_ready";
  blocking_reason: string | null;
  broker_result_cents: number | string;
  company_name: string | null;
  correlation_status: "conflict" | "ready" | "unmatched";
  id: string;
  opened_at: string;
  operated_on: string | null;
  phase: string | null;
  prop_accounts: Array<{
    accountId: string;
    accountName: string;
    allocatedBrokerResultInCents: number;
  }>;
  rounding_difference_cents: number | string;
  settled_at: string | null;
}>;

type Props = Readonly<{
  brokerAccountNames?: readonly string[];
  manualAccounts?: readonly ManualCoverageAccount[];
  propAccountNames?: readonly string[];
  todayOperationCount?: number;
  todayResultInCents?: number;
}>;

export type ManualCoverageAccount = Readonly<{
  companyName: string;
  id: string;
  label: string;
  state: "closed" | "live" | "virgin";
}>;

const labels = {
  open: "En operación",
  ready: "Flat estable",
  settling: "Estabilizando",
  uncertain: "Revisar",
  waiting: "Sin actividad",
} as const;

function formatMoney(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("es-AR", { currency: "USD", style: "currency" }).format(value);
}

function moneyNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(value));
}

function duration(openedAt: string, closedAt: string | null) {
  const seconds = Math.max(0, Math.floor((Date.parse(closedAt ?? new Date().toISOString()) - Date.parse(openedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function ManualCoverageAssignment({ accounts, batch }: Readonly<{
  accounts: readonly ManualCoverageAccount[];
  batch: AutomaticBatchRow;
}>) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [closeAccounts, setCloseAccounts] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedCompany = accounts.find((account) => selectedIds.includes(account.id))?.companyName ?? null;
  const allocation = selectedIds.length > 0
    ? Math.round(Number(batch.broker_result_cents) / selectedIds.length)
    : null;

  function toggleAccount(accountId: string) {
    setFeedback(null);
    setSelectedIds((current) => current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId]);
  }

  return (
    <section className={`manual-coverage-assignment${expanded ? " open" : ""}`}>
      <button
        aria-expanded={expanded}
        className="manual-coverage-toggle"
        onClick={() => {
          setExpanded((current) => !current);
          setFeedback(null);
        }}
        type="button"
      >
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        Asignar cuentas
      </button>
      {expanded && <form
        className="manual-coverage-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || selectedIds.length === 0) return;
          setFeedback(null);
          startTransition(async () => {
            try {
              const result = await assignManualAccountsToCoverage({
                accountIds: selectedIds,
                batchId: batch.id,
                closeAccounts,
              });
              setFeedback(result);
              if (result.ok) {
                setSelectedIds([]);
                router.refresh();
              }
            } catch {
              setFeedback({
                message: "No se pudo completar la conciliación. La cobertura no fue modificada; actualizá la página e intentá nuevamente.",
                ok: false,
              });
            }
          });
        }}
      >
        <p>Elegí todas las cuentas que participaron. NODAL vinculará un registro existente o distribuirá esta cobertura sin duplicarla.</p>
        <div className="manual-coverage-account-list">
          {accounts.map((account) => (
            <label className={selectedIds.includes(account.id) ? "selected" : ""} key={account.id}>
              <input
                checked={selectedIds.includes(account.id)}
                disabled={pending || (selectedCompany !== null && selectedCompany !== account.companyName)}
                onChange={() => toggleAccount(account.id)}
                type="checkbox"
              />
              <span><strong>{account.label}</strong><small>{account.companyName} · {account.state === "closed" ? "Cerrada" : account.state === "live" ? "Activa" : "Virgen"}</small></span>
            </label>
          ))}
        </div>
        <div className="manual-coverage-summary">
          <span>{selectedIds.length} {selectedIds.length === 1 ? "cuenta seleccionada" : "cuentas seleccionadas"}</span>
          <strong>{allocation === null ? "—" : `${formatMoney(allocation / 100)} por cuenta`}</strong>
        </div>
        <label className="manual-coverage-close">
          <input checked={closeAccounts} disabled={pending} onChange={(event) => setCloseAccounts(event.target.checked)} type="checkbox" />
          <span><strong>Estas cuentas quedaron cerradas</strong><small>Usalo cuando este trade haya quemado o cerrado todas las cuentas seleccionadas.</small></span>
        </label>
        <button
          className="manual-coverage-submit"
          disabled={pending || selectedIds.length === 0}
          type="submit"
        >
          {pending ? "Asignando…" : "Asignar y conciliar"}
        </button>
        {feedback && <p aria-live="polite" className={`manual-coverage-feedback ${feedback.ok ? "success" : "error"}`} role="status">{feedback.message}</p>}
      </form>}
    </section>
  );
}

function latestOpenPosition(events: NinjaTelemetryRow[], connectionName: string, accountName: string) {
  const latest = new Map<string, NinjaTelemetryRow>();
  for (const event of events) {
    if (event.connection_name !== connectionName || event.account_name !== accountName || event.event_type !== "position" || !event.instrument) continue;
    const prior = latest.get(event.instrument);
    if (!prior || prior.occurred_at <= event.occurred_at) latest.set(event.instrument, event);
  }
  return [...latest.values()].flatMap((event) => {
    const quantity = typeof event.payload.quantity === "number" ? event.payload.quantity : 0;
    const direction = typeof event.payload.marketPosition === "string" ? event.payload.marketPosition : "—";
    return quantity > 0 && direction !== "Flat"
      ? [{ direction, instrument: event.instrument ?? "—", quantity }]
      : [];
  });
}

export function TradeTelemetryProbe({
  brokerAccountNames = [],
  manualAccounts = [],
  propAccountNames = [],
  todayOperationCount = 0,
  todayResultInCents = 0,
}: Props) {
  const [events, setEvents] = useState<NinjaTelemetryRow[]>([]);
  const [operations, setOperations] = useState<TechnicalOperationRow[]>([]);
  const [batches, setBatches] = useState<AutomaticBatchRow[]>([]);
  const [available, setAvailable] = useState(true);
  const probes = useMemo(() => buildNinjaOperationProbe(events, new Date()), [events]);
  const visibleProbes = probes.filter((probe) =>
    probe.status !== "waiting" || operations.some((operation) =>
      operation.connection_name === probe.connectionName && operation.account_name === probe.accountName,
    ),
  );
  const propNames = new Set(propAccountNames);
  const brokerNames = new Set(brokerAccountNames);
  const activeProbes = visibleProbes.filter((probe) => probe.status === "open" || probe.status === "settling");
  const activeProps = activeProbes.filter((probe) => propNames.has(probe.accountName));
  const activeBroker = activeProbes.filter((probe) => brokerNames.has(probe.accountName));
  const otherActive = activeProbes.filter((probe) => !propNames.has(probe.accountName) && !brokerNames.has(probe.accountName));
  const brokerFloating = activeBroker.reduce((total, probe) =>
    total + (probe.netLiquidation !== null && probe.cashValue !== null ? probe.netLiquidation - probe.cashValue : 0), 0);
  const operationMonths = new Map<string, TechnicalOperationRow[]>();
  for (const operation of operations.filter((candidate) => candidate.status === "closed")) {
    const key = operation.opened_at.slice(0, 7);
    operationMonths.set(key, [...(operationMonths.get(key) ?? []), operation]);
  }
  const activeGroups = [
    activeProps.length > 0 ? { label: "Cuentas prop", probes: activeProps } : null,
    activeBroker.length > 0 ? { label: "Cobertura", probes: activeBroker } : null,
    otherActive.length > 0 ? { label: "Otras cuentas", probes: otherActive } : null,
  ].filter((group): group is { label: string; probes: typeof activeProbes } => group !== null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await fetch("/api/integrations/ninjatrader/telemetry", { cache: "no-store" });
        const body = await result.json() as { batches?: AutomaticBatchRow[]; events?: NinjaTelemetryRow[]; operations?: TechnicalOperationRow[] };
        if (active && result.ok) { setBatches(body.batches ?? []); setEvents(body.events ?? []); setOperations(body.operations ?? []); setAvailable(true); }
        else if (active) setAvailable(false);
      } catch { if (active) setAvailable(false); }
    }
    void refresh();
    const interval = window.setInterval(refresh, 2_500);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <section className="telemetry-probe real-telemetry-overview" aria-labelledby="telemetry-probe-title">
      <div className="demo-operation-grid">
        <article className="demo-broker-balance"><span>Cuentas prop en curso</span><strong>{activeProps.length}</strong></article>
        <article className="demo-broker-balance"><span>Cobertura broker</span><strong className={brokerFloating >= 0 ? "positive" : "negative"}>{formatMoney(brokerFloating)}</strong></article>
        <article className="demo-today-result"><span>Resultado de hoy</span><strong>{formatMoney(todayResultInCents / 100)}</strong><small>{todayOperationCount} cerradas</small></article>
      </div>
      {!available ? <p className="telemetry-empty">No se pudo actualizar la operación.</p> : null}
      {activeProps.length > 0 && activeBroker.length > 0 && (
        <article className="demo-coverage-operation">
          <div><span className="demo-live-dot" /><strong>Operación sincronizada</strong></div>
          <p><span>Cuentas prop</span><b>{activeProps.length} detectadas</b></p>
          <i aria-hidden="true">↔</i>
          <p><span>Cobertura</span><b>{activeBroker.map((probe) => probe.accountName).join(", ")}</b></p>
        </article>
      )}
      {batches.length > 0 && (
        <details className="demo-operation-disclosure automatic-batch-status" open={batches.some((batch) => batch.accounting_status === "blocked") || undefined}>
          <summary>
            <span>Automatización</span>
            <strong>{batches.filter((batch) => batch.accounting_status === "shadow_ready").length} conciliadas</strong>
            <i aria-hidden="true" />
          </summary>
          <div className="automatic-batch-list">
            {batches.slice(0, 8).map((batch) => (
              <article className={batch.accounting_status === "blocked" ? "blocked" : ""} key={batch.id}>
                <div>
                  <strong>{batch.company_name ?? "Cobertura sin asignar"}</strong>
                  <span>{batch.prop_accounts.length} {batch.prop_accounts.length === 1 ? "cuenta" : "cuentas"}{batch.phase ? ` · ${batch.phase}` : ""}</span>
                </div>
                <div>
                  <strong>{formatMoney((moneyNumber(batch.broker_result_cents) ?? 0) / 100)}</strong>
                  <span className={batch.accounting_status === "blocked" ? "blocked" : "ready"}>
                    {batch.accounting_status === "blocked" ? batch.blocking_reason ?? "Revisar" : "Conciliada"}
                  </span>
                </div>
                {batch.accounting_status === "blocked" && batch.correlation_status === "unmatched" && manualAccounts.length > 0 && (
                  <ManualCoverageAssignment accounts={manualAccounts} batch={batch} />
                )}
              </article>
            ))}
          </div>
        </details>
      )}
      {activeProbes.length === 0 ? <p className="telemetry-empty">Sin operaciones activas.</p> : (
        <>
          {activeGroups.map((group) => (
            <div className="real-live-group" key={group.label}>
              <div className="demo-group-title demo-live-title"><h3>{group.label}</h3><span>{group.probes.length}</span></div>
              <div className="demo-live-operations">
                {group.probes.map((probe) => {
                  const positions = latestOpenPosition(events, probe.connectionName, probe.accountName);
                  const operation = operations.find((candidate) =>
                    candidate.connection_name === probe.connectionName && candidate.account_name === probe.accountName && candidate.status !== "closed",
                  );
                  return <article className={`demo-live-operation${group.label === "Cobertura" ? " demo-broker-operation" : ""}`} key={`${probe.connectionName}-${probe.accountName}`}>
                    <div><span className="demo-live-dot" />{labels[probe.status]}</div>
                    <h3>{probe.accountName}</h3>
                    <p>{probe.connectionName}</p>
                    <dl>
                      <div><dt>Posición</dt><dd>{positions.length ? positions.map((position) => `${position.direction} · ${position.quantity} ${position.instrument}`).join(" + ") : "Flat"}</dd></div>
                      <div><dt>Net liquidation</dt><dd>{formatMoney(probe.netLiquidation)}</dd></div>
                      <div><dt>Cash value</dt><dd>{formatMoney(probe.cashValue)}</dd></div>
                      <div><dt>Duración</dt><dd>{operation ? duration(operation.opened_at, operation.settled_at) : "—"}</dd></div>
                    </dl>
                  </article>;
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {operationMonths.size > 0 && (
        <div className="demo-history real-operation-history">
          <div className="demo-group-title"><h3>Historial</h3><span>{operations.filter((operation) => operation.status === "closed").length}</span></div>
          {[...operationMonths.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([month, monthOperations], monthIndex) => (
            <details className="demo-period-history" key={month} open={monthIndex === 0}>
              <summary>
                <span>{monthLabel(`${month}-01T12:00:00Z`)}</span>
                <small>{monthOperations.length} operaciones</small>
                <strong>{formatMoney(monthOperations.reduce((total, operation) => total + (moneyNumber(operation.result) ?? 0), 0))}</strong>
                <i aria-hidden="true" />
              </summary>
              <div>
                {monthOperations.map((operation, index) => (
                  <details className="demo-history-day" key={operation.id} open={monthIndex === 0 && index === 0}>
                    <summary>
                      <span>{formatTime(operation.opened_at)}</span>
                      <small>{operation.account_name}</small>
                      <strong className={(moneyNumber(operation.result) ?? 0) < 0 ? "negative" : ""}>{formatMoney(moneyNumber(operation.result))}</strong>
                      <i aria-hidden="true" />
                    </summary>
                    <div>
                      <p>
                        <span>{operation.account_name}</span>
                        <small>{operation.instruments.join(" + ") || "Sin instrumento"}</small>
                        <strong>{duration(operation.opened_at, operation.settled_at)}</strong>
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {visibleProbes.some((probe) => !activeProbes.includes(probe)) && (
        <details className="telemetry-technical-details telemetry-closed-diagnostics">
          <summary>Datos técnicos recientes</summary>
          <div className="telemetry-probe-grid">
          {visibleProbes.filter((probe) => !activeProbes.includes(probe)).map((probe) => {
            const operation = operations.find((candidate) =>
              candidate.connection_name === probe.connectionName && candidate.account_name === probe.accountName,
            );
            return <article key={`${probe.connectionName}-${probe.accountName}`}>
              <div><strong>{probe.accountName}</strong><small>{probe.connectionName}</small></div>
              <span className={`telemetry-state ${probe.status}`}>{labels[probe.status]}</span>
              {operation ? <div className="telemetry-operation-record">
                <div>
                  <span>Última operación</span>
                  <strong className={(moneyNumber(operation.result) ?? 0) >= 0 ? "positive" : "negative"}>
                    {formatMoney(moneyNumber(operation.result))}
                  </strong>
                </div>
                <p>{formatMoney(moneyNumber(operation.opening_balance))} → {formatMoney(moneyNumber(operation.closing_balance))}</p>
                <small>
                  {formatTime(operation.opened_at)} · {operation.execution_count} ejec. · {operation.status === "closed" ? "Cerrada" : operation.status === "open" ? "Abierta" : "Estabilizando"}
                </small>
              </div> : null}
              <details className="telemetry-technical-details">
                <summary>Datos de NinjaTrader</summary>
                <dl>
                  <div><dt>Posiciones</dt><dd>{probe.openPositions}</dd></div>
                  <div><dt>Ejecuciones</dt><dd>{probe.executionCount}</dd></div>
                  <div><dt>Cash Value</dt><dd>{formatMoney(probe.cashValue)}</dd></div>
                  <div><dt>Net Liq.</dt><dd>{formatMoney(probe.netLiquidation)}</dd></div>
                </dl>
              </details>
            </article>;
          })}
        </div>
        </details>
      )}
    </section>
  );
}
