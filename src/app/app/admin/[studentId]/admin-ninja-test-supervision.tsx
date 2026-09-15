"use client";

import { useEffect, useMemo, useState } from "react";

import { classifyNinjaAccount } from "@/modules/ninja/domain/account-classification";
import {
  deriveNinjaTestReadiness,
  type AdminNinjaTestSupervision,
  type NinjaSupervisionBatch,
  type NinjaSupervisionSession,
} from "@/modules/ninja/domain/admin-test-supervision";

type Props = Readonly<{
  initialData: AdminNinjaTestSupervision;
  userId: string;
}>;

const money = (cents: number) => new Intl.NumberFormat("es-AR", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
}).format(cents / 100).replace("US$", "US$");

const dollars = (value: number | null) => value === null ? "—" : money(Math.round(value * 100));

const time = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      second: "2-digit",
    }).format(new Date(value))
  : "—";

function sessionState(session: NinjaSupervisionSession) {
  if (session.status === "open") return "En curso";
  if (session.status === "settling") return "Estabilizando";
  return "Cerrada";
}

function batchState(batch: NinjaSupervisionBatch) {
  if (batch.accountingStatus === "committed") return "Registrada";
  if (batch.accountingStatus === "shadow_ready") return "Conciliada";
  if (batch.status === "unmatched") return "Sin contraparte";
  if (batch.status === "conflict") return "Conflicto";
  return "Bloqueada";
}

export function AdminNinjaTestSupervisionPanel({ initialData, userId }: Props) {
  const [data, setData] = useState(initialData);
  const [refreshError, setRefreshError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/ninja-supervision/${userId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("refresh failed");
        const next = await response.json() as AdminNinjaTestSupervision;
        if (active) {
          setData(next);
          setNow(Date.now());
          setRefreshError(false);
        }
      } catch {
        if (active) setRefreshError(true);
      }
    };
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [userId]);

  const readiness = useMemo(() => deriveNinjaTestReadiness(data, now), [data, now]);
  const linkKeys = useMemo(() => new Set(data.links.map((link) =>
    `${link.connectionName}\u0000${link.accountName}`,
  )), [data.links]);

  return (
    <section className="admin-ninja-supervision" aria-labelledby="ninja-test-title">
      <header className="admin-ninja-supervision-heading">
        <div>
          <h2 id="ninja-test-title">Prueba Ninja</h2>
          <span>{refreshError ? "Sin actualización" : "Actualización automática"}</span>
        </div>
        <strong className={readiness.ready ? "ready" : "pending"}>
          {readiness.ready ? "Listo para probar" : "Preparación pendiente"}
        </strong>
      </header>

      <div className="admin-ninja-checks">
        {readiness.checks.map((check) => (
          <article className={check.ok ? "ok" : "pending"} key={check.id}>
            <i aria-hidden="true" />
            <div><strong>{check.label}</strong><span>{check.detail}</span></div>
          </article>
        ))}
      </div>

      <div className="admin-ninja-section-heading">
        <h3>Inventario Ninja</h3>
        <span>{data.inventory.accounts.length} cuentas · {time(data.inventory.observedAt)}</span>
      </div>
      {data.inventory.accounts.length === 0 ? (
        <p className="admin-ninja-empty">Aparecerá cuando Ivo vincule y ejecute el conector.</p>
      ) : (
        <div className="admin-ninja-account-list">
          {data.inventory.accounts.map((account) => {
            const detected = classifyNinjaAccount(
              account,
              data.inventory.observedAt ?? new Date(now).toISOString(),
            );
            const linked = linkKeys.has(`${account.connectionName}\u0000${account.accountName}`);
            return (
              <article key={`${account.connectionName}-${account.accountName}`}>
                <div className="admin-ninja-account-name">
                  <strong>{account.accountName}</strong>
                  <span>{account.connectionName}</span>
                </div>
                <div><span>Tipo</span><strong>{detected.type === "prop" ? `${detected.company} · ${detected.phase}` : detected.type === "broker" ? "Broker" : detected.type === "simulator" ? "Simulación" : "Sin clasificar"}</strong></div>
                <div><span>Cash value</span><strong>{dollars(account.cashValue)}</strong></div>
                <div><span>Net liquidation</span><strong>{dollars(account.netLiquidation)}</strong></div>
                <div><span>Registro</span><strong>{detected.type === "prop" ? linked ? "Incorporada" : "Pendiente" : "No corresponde"}</strong></div>
              </article>
            );
          })}
        </div>
      )}

      <div className="admin-ninja-monitor-grid">
        <section>
          <div className="admin-ninja-section-heading">
            <h3>Operaciones técnicas</h3>
            <span>{data.sessions.length}</span>
          </div>
          <div className="admin-ninja-event-list">
            {data.sessions.length === 0 ? <p className="admin-ninja-empty">Sin operaciones recibidas.</p> : data.sessions.slice(0, 10).map((session) => (
              <article key={session.id}>
                <div><strong>{session.accountName}</strong><span>{session.connectionName}</span></div>
                <div><strong>{sessionState(session)}</strong><span>{session.direction ?? "—"} · {session.quantity} · {session.instruments.join(", ") || "—"}</span></div>
                <div><strong>{dollars(session.result)}</strong><span>{time(session.openedAt)}</span></div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="admin-ninja-section-heading">
            <h3>Conciliación automática</h3>
            <span>Registro contable</span>
          </div>
          <div className="admin-ninja-event-list">
            {data.batches.length === 0 ? <p className="admin-ninja-empty">Sin agrupaciones procesadas.</p> : data.batches.slice(0, 10).map((batch) => (
              <article className={batch.accountingStatus === "blocked" ? "blocked" : "reconciled"} key={batch.id}>
                <div><strong>{batch.brokerAccount ?? "Broker"}</strong><span>{batch.propAccounts.length} cuentas prop</span></div>
                <div><strong>{batchState(batch)}</strong><span>{batch.blockingReason ?? `${batch.company ?? ""} ${batch.phase ?? ""}`.trim()}</span></div>
                <div><strong>{money(batch.brokerResultInCents)}</strong><span>{time(batch.openedAt)}</span></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
