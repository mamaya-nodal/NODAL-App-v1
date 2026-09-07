"use client";

import { useEffect, useMemo, useState } from "react";

import { buildNinjaOperationProbe, type NinjaTelemetryRow } from "@/modules/ninja/domain/operation-probe";

type TechnicalOperationRow = Readonly<{
  account_name: string;
  closing_balance: number | string | null;
  connection_name: string;
  execution_count: number;
  id: number;
  instruments: string[];
  opened_at: string;
  opening_balance: number | string | null;
  result: number | string | null;
  settled_at: string | null;
  status: "closed" | "open" | "settling";
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

export function TradeTelemetryProbe() {
  const [events, setEvents] = useState<NinjaTelemetryRow[]>([]);
  const [operations, setOperations] = useState<TechnicalOperationRow[]>([]);
  const [available, setAvailable] = useState(true);
  const probes = useMemo(() => buildNinjaOperationProbe(events, new Date()), [events]);
  const visibleProbes = probes.filter((probe) =>
    probe.status !== "waiting" || operations.some((operation) =>
      operation.connection_name === probe.connectionName && operation.account_name === probe.accountName,
    ),
  );

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await fetch("/api/integrations/ninjatrader/telemetry", { cache: "no-store" });
        const body = await result.json() as { events?: NinjaTelemetryRow[]; operations?: TechnicalOperationRow[] };
        if (active && result.ok) { setEvents(body.events ?? []); setOperations(body.operations ?? []); setAvailable(true); }
        else if (active) setAvailable(false);
      } catch { if (active) setAvailable(false); }
    }
    void refresh();
    const interval = window.setInterval(refresh, 2_500);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <section className="telemetry-probe" aria-labelledby="telemetry-probe-title">
      <div className="telemetry-probe-heading">
        <h2 id="telemetry-probe-title">Operación</h2>
        <span className={available ? "online" : "offline"}>{available ? "En línea" : "Sin conexión"}</span>
      </div>
      {visibleProbes.length === 0 ? <p className="telemetry-empty">Sin operaciones detectadas.</p> : (
        <div className="telemetry-probe-grid">
          {visibleProbes.map((probe) => {
            const operation = operations.find((candidate) =>
              candidate.connection_name === probe.connectionName && candidate.account_name === probe.accountName,
            );
            return <article key={`${probe.connectionName}-${probe.accountName}`}>
              <div><strong>{probe.accountName}</strong><small>{probe.connectionName}</small></div>
              <span className={`telemetry-state ${probe.status}`}>{labels[probe.status]}</span>
              <dl>
                <div><dt>Posiciones</dt><dd>{probe.openPositions}</dd></div>
                <div><dt>Ejecuciones</dt><dd>{probe.executionCount}</dd></div>
                <div><dt>Cash Value</dt><dd>{formatMoney(probe.cashValue)}</dd></div>
                <div><dt>Net Liq.</dt><dd>{formatMoney(probe.netLiquidation)}</dd></div>
              </dl>
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
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
