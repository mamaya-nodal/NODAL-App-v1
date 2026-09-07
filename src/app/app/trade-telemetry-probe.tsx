"use client";

import { useEffect, useMemo, useState } from "react";

import { buildNinjaOperationProbe, type NinjaTelemetryRow } from "@/modules/ninja/domain/operation-probe";

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

export function TradeTelemetryProbe() {
  const [events, setEvents] = useState<NinjaTelemetryRow[]>([]);
  const [available, setAvailable] = useState(true);
  const probes = useMemo(() => buildNinjaOperationProbe(events, new Date()), [events]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await fetch("/api/integrations/ninjatrader/telemetry", { cache: "no-store" });
        const body = await result.json() as { events?: NinjaTelemetryRow[] };
        if (active && result.ok) { setEvents(body.events ?? []); setAvailable(true); }
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
        <div><h2 id="telemetry-probe-title">Detección de operación</h2><p>Prueba técnica · no genera registros</p></div>
        <span className={available ? "online" : "offline"}>{available ? "Canal listo" : "Sin conexión"}</span>
      </div>
      {probes.length === 0 ? <p className="telemetry-empty">Esperando la primera ejecución o posición del conector 0.4.</p> : (
        <div className="telemetry-probe-grid">
          {probes.map((probe) => (
            <article key={`${probe.connectionName}-${probe.accountName}`}>
              <div><strong>{probe.accountName}</strong><small>{probe.connectionName}</small></div>
              <span className={`telemetry-state ${probe.status}`}>{labels[probe.status]}</span>
              <dl>
                <div><dt>Posiciones</dt><dd>{probe.openPositions}</dd></div>
                <div><dt>Ejecuciones</dt><dd>{probe.executionCount}</dd></div>
                <div><dt>Cash Value</dt><dd>{formatMoney(probe.cashValue)}</dd></div>
                <div><dt>Net Liq.</dt><dd>{formatMoney(probe.netLiquidation)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
