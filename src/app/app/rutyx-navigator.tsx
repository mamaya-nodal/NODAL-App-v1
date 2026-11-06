"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatBrokerRatio } from "@/modules/rutyx/domain/broker-ratio";
import type { RutyxAccount, RutyxContext, RutyxOperation, RutyxRouteState, RutyxStrategy } from "@/modules/rutyx/domain/types";

import styles from "./rutyx-navigator.module.css";

type Snapshot = Readonly<{
  accounts: readonly RutyxAccount[];
  companies: readonly Readonly<{ enabled: boolean; id: string; name: string }>[];
  contexts: readonly RutyxContext[];
  events: readonly Readonly<{ account_id: string; broker_ratio: number; created_at: string; event_type: string; id: string; outcome: string | null; to_node_id: string }>[];
  operations: Readonly<Record<string, RutyxOperation>>;
  states: readonly RutyxRouteState[];
  strategies: readonly RutyxStrategy[];
}>;

export function RutyxNavigator({ expanded = false }: Readonly<{ expanded?: boolean }>) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [contextId, setContextId] = useState("");
  const [accountCount, setAccountCount] = useState("1");

  useEffect(() => {
    let active = true;
    fetch("/api/rutyx/session", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as Snapshot & { message?: string };
      if (!active) return;
      if (!response.ok) setMessage(payload.message ?? "No se pudo abrir Rutyx.");
      else {
        setSnapshot(payload);
        setAccountId(payload.accounts[0]?.id || "");
        setStrategyId(payload.strategies.find((strategy) => strategy.enabled)?.id || "");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const state = snapshot?.states.find((candidate) => candidate.accountId === accountId) ?? null;
  const operation = accountId ? snapshot?.operations[accountId] ?? null : null;
  const contexts = useMemo(() => snapshot?.contexts.filter((context) => context.strategyId === strategyId) ?? [], [snapshot, strategyId]);
  const selectedContextId = contexts.some((context) => context.id === contextId) ? contextId : contexts[0]?.id ?? "";
  const events = snapshot?.events.filter((event) => event.account_id === accountId) ?? [];

  async function mutate(body: Record<string, unknown>) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/rutyx/session", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
    const payload = await response.json() as Snapshot & { message?: string };
    if (!response.ok) setMessage(payload.message ?? "No se pudo guardar el cambio.");
    else setSnapshot(payload);
    setSaving(false);
  }

  if (loading) return <div className={styles.loading}>Abriendo tus rutas…</div>;
  if (!snapshot) return <div className={styles.loading}>{message || "Rutyx no está disponible."}</div>;

  return <section className={styles.root} data-expanded={expanded ? "true" : "false"}>
    <header className={styles.heading}>
      <div><span>RUTYX</span><strong>Gestión de rutas</strong></div>
      {!expanded ? <Link href="/app/rutyx">Expandir ↗</Link> : <Link href="/app">Volver a NODAL</Link>}
    </header>

    <div className={styles.companies}>
      {snapshot.companies.map((company) => <button aria-pressed={company.id === "LUCID"} disabled={!company.enabled} key={company.id} type="button">
        {company.name}{!company.enabled ? <small>Próximamente</small> : null}
      </button>)}
    </div>

    <label className={styles.field}>Cuenta LUCID
      <select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
        {snapshot.accounts.map((account) => <option key={account.id} value={account.id}>{account.label}{account.identityName ? ` · ${account.identityName}` : ""}</option>)}
      </select>
    </label>

    {!snapshot.accounts.length ? <div className={styles.empty}>No hay cuentas LUCID registradas para usar con Rutyx.</div> : state ? <>
      <div className={styles.routeMeta}>
        <span>{snapshot.strategies.find((strategy) => strategy.id === state.strategyId)?.name}</span>
        <strong>{state.phase === "funded" ? "Funded" : "Evaluación"}</strong>
      </div>
      {operation ? <>
        <article className={styles.operation}>
          <div className={styles.operationTitle}><span>Operación actual</span><strong>{operation.stage}</strong><small>Día {operation.session}</small></div>
          <div className={styles.instruments}>
            <div><span>Cuenta de fondeo</span><strong>{operation.routeContractsPerAccount} {operation.fundingInstrument}</strong></div>
            <div><span>Cobertura</span><strong>{operation.coverageContractsPerAccount} {operation.brokerInstrument}</strong></div>
          </div>
          <div className={styles.levels}><span>TP <b>{operation.tpPips}</b></span><span>SL <b>{operation.slPips}</b></span></div>
        </article>
        <article className={styles.ratio}>
          <div><span>Ratio broker</span><strong>{formatBrokerRatio(state.brokerRatio)}</strong></div>
          <p>{operation.coverageContractsPerAccount} cobertura × {state.fundingAccountCount} cuentas ÷ {operation.routeContractsPerAccount} contratos de ruta</p>
          <button onClick={() => void navigator.clipboard.writeText(String(state.brokerRatio))} type="button">Copiar ratio broker</button>
        </article>
        <div className={styles.results}>
          <button disabled={saving} onClick={() => void mutate({ accountId, action: "result", outcome: "TP", revision: state.revision })} type="button">Resultado TP</button>
          <button disabled={saving} onClick={() => void mutate({ accountId, action: "result", outcome: "SL", revision: state.revision })} type="button">Resultado SL</button>
        </div>
        <small className={styles.confirmation}>Rutyx propone el siguiente paso; el resultado sólo avanza cuando lo confirmás.</small>
      </> : <div className={styles.completed}><strong>Rama finalizada</strong><span>Esta cuenta llegó a un cierre documentado de la ruta.</span></div>}
    </> : <div className={styles.setup}>
      <strong>Elegí el punto de la ruta</strong>
      <label className={styles.field}>Estrategia
        <select onChange={(event) => setStrategyId(event.target.value)} value={strategyId}>
          {snapshot.strategies.map((strategy) => <option disabled={!strategy.enabled} key={strategy.id} value={strategy.id}>{strategy.name}{strategy.enabled ? "" : " · no habilitada"}</option>)}
        </select>
      </label>
      <label className={styles.field}>Etapa y recorrido
        <select onChange={(event) => setContextId(event.target.value)} value={selectedContextId}>
          {contexts.map((context) => <option key={context.id} value={context.id}>{context.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>Cantidad de cuentas de fondeo
        <input max="100" min="1" onChange={(event) => setAccountCount(event.target.value)} type="number" value={accountCount} />
      </label>
      <button className={styles.primary} disabled={saving || !accountId || !selectedContextId} onClick={() => void mutate({ accountId, action: "start", contextId: selectedContextId, fundingAccountCount: Number(accountCount), strategyId })} type="button">Iniciar ruta</button>
    </div>}

    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    {expanded ? <section className={styles.history}><h2>Historial de la cuenta</h2>{events.length ? events.map((event) => <article key={event.id}><span>{event.event_type === "started" ? "Inicio de ruta" : `Resultado ${event.outcome}`}</span><strong>{formatBrokerRatio(Number(event.broker_ratio))}</strong><time>{new Date(event.created_at).toLocaleString("es-AR")}</time></article>) : <p>Todavía no hay movimientos guardados.</p>}</section> : null}
  </section>;
}
