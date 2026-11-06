"use client";

import { useEffect, useMemo, useState } from "react";

import { formatBrokerRatio } from "@/modules/rutyx/domain/broker-ratio";
import type { RutyxAccount, RutyxContext, RutyxOperation, RutyxRouteState, RutyxStrategy } from "@/modules/rutyx/domain/types";

import styles from "./rutyx-navigator.module.css";

type Snapshot = Readonly<{
  accounts: readonly RutyxAccount[];
  companies: readonly Readonly<{ enabled: boolean; id: string; name: string }>[];
  contexts: readonly RutyxContext[];
  events: readonly Readonly<{ account_id: string; broker_ratio: number; created_at: string; event_type: string; id: string; outcome: string | null; to_node_id: string }>[];
  identities: readonly Readonly<{ id: string; name: string }>[];
  operations: Readonly<Record<string, RutyxOperation>>;
  states: readonly RutyxRouteState[];
  strategies: readonly RutyxStrategy[];
}>;

export function RutyxNavigator({ expanded = false, onExpand }: Readonly<{ expanded?: boolean; onExpand?: () => void }>) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [identityId, setIdentityId] = useState("personal");
  const [strategyId, setStrategyId] = useState("");
  const [contextId, setContextId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<readonly string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/rutyx/session", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as Snapshot & { message?: string };
      if (!active) return;
      if (!response.ok) setMessage(payload.message ?? "No se pudo abrir Rutyx.");
      else {
        setSnapshot(payload);
        const firstAccount = payload.accounts[0];
        setAccountId(firstAccount?.id || "");
        setIdentityId(firstAccount?.identityId ?? payload.identities[0]?.id ?? "personal");
        setSelectedAccountIds([]);
        setStrategyId(payload.strategies.find((strategy) => strategy.enabled)?.id || "");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const state = snapshot?.states.find((candidate) => candidate.accountId === accountId) ?? null;
  const operation = accountId ? snapshot?.operations[accountId] ?? null : null;
  const linkedStates = state ? snapshot?.states.filter((candidate) => candidate.groupId === state.groupId) ?? [] : [];
  const linkedAccounts = linkedStates.flatMap((candidate) => snapshot?.accounts.find((account) => account.id === candidate.accountId) ?? []);
  const contexts = useMemo(() => snapshot?.contexts.filter((context) => context.strategyId === strategyId) ?? [], [snapshot, strategyId]);
  const selectedContextId = contexts.some((context) => context.id === contextId) ? contextId : contexts[0]?.id ?? "";
  const events = snapshot?.events.filter((event) => event.account_id === accountId) ?? [];
  const visibleAccounts = (snapshot?.accounts ?? []).filter((account) => (account.identityId ?? "personal") === identityId);

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
      {!expanded ? <button className={styles.expand} onClick={onExpand} type="button">Expandir ↗</button> : null}
    </header>

    <div className={styles.companies}>
      {snapshot.companies.map((company) => <button aria-pressed={company.id === "LUCID"} disabled={!company.enabled} key={company.id} type="button">
        {company.name}{!company.enabled ? <small>Próximamente</small> : null}
      </button>)}
    </div>

    <label className={styles.field}>Identidad
      <select onChange={(event) => {
        const nextIdentityId = event.target.value;
        const identityAccounts = snapshot.accounts.filter((account) => (account.identityId ?? "personal") === nextIdentityId);
        const activeAccount = identityAccounts.find((account) => snapshot.states.some((candidate) => candidate.accountId === account.id)) ?? identityAccounts[0];
        setIdentityId(nextIdentityId);
        setAccountId(activeAccount?.id ?? "");
        setSelectedAccountIds([]);
      }} value={identityId}>
        {snapshot.identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.name}</option>)}
      </select>
    </label>

    {!visibleAccounts.length ? <div className={styles.empty}>Esta identidad no tiene cuentas LUCID activas para enlazar.</div> : state ? <>
      <div className={styles.routeMeta}>
        <span>{snapshot.strategies.find((strategy) => strategy.id === state.strategyId)?.name}</span>
        <strong>{state.phase === "funded" ? "Funded" : "Evaluación"}</strong>
      </div>
      <div className={styles.linkedAccounts}><strong>{linkedAccounts.length} cuentas enlazadas</strong>{linkedAccounts.map((account) => <span key={account.id}>{account.externalName}{account.identityName ? ` · ${account.identityName}` : ""}</span>)}</div>
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
      <fieldset className={styles.accountPicker}>
        <legend>Cuentas a enlazar <span>{selectedAccountIds.length} seleccionadas</span></legend>
        {visibleAccounts.map((account) => <label key={account.id}>
          <input checked={selectedAccountIds.includes(account.id)} onChange={(event) => {
            setSelectedAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id));
            if (event.target.checked) setAccountId(account.id);
          }} type="checkbox" />
          <span><strong>{account.externalName}</strong>{account.identityName ? <small>{account.identityName}</small> : null}</span>
        </label>)}
      </fieldset>
      <button className={styles.primary} disabled={saving || !selectedContextId || selectedAccountIds.length === 0} onClick={() => void mutate({ accountIds: selectedAccountIds, action: "start", contextId: selectedContextId, fundingAccountCount: selectedAccountIds.length, strategyId })} type="button">Enlazar e iniciar ruta</button>
    </div>}

    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    {expanded ? <section className={styles.history}><h2>Historial de la cuenta</h2>{events.length ? events.map((event) => <article key={event.id}><span>{event.event_type === "started" ? "Inicio de ruta" : `Resultado ${event.outcome}`}</span><strong>{formatBrokerRatio(Number(event.broker_ratio))}</strong><time>{new Date(event.created_at).toLocaleString("es-AR")}</time></article>) : <p>Todavía no hay movimientos guardados.</p>}</section> : null}
  </section>;
}
