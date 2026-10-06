"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  IdentityAccount,
  IdentityCompanyPower,
  IdentityOperationalStatus,
  IdentitySummary,
} from "@/modules/identities/domain/identity-summary";

import {
  assignIdentityAccount,
  createIdentityDirectly,
  sendIdentityConnectorInstallation,
  setIdentitySignal,
  unassignIdentityAccount,
  updateIdentityOperationalStatus,
} from "./identity-actions";
import { NinjaConnectorPanel, type NinjaConnectorStatus } from "./ninja-connector-panel";

type Props = Readonly<{
  accounts: IdentityAccount[];
  connectors: NinjaConnectorStatus[];
  identities: IdentitySummary[];
  ownerName: string;
  signalStates: Readonly<Record<string, boolean>>;
  workspaceId: string;
}>;

const operationalStatusOptions: ReadonlyArray<Readonly<{
  label: string;
  value: IdentityOperationalStatus;
}>> = [
  { label: "Desconfigurada", value: "unconfigured" },
  { label: "Configurada", value: "configured" },
  { label: "Activa", value: "active" },
  { label: "Muerta", value: "dead" },
];

function operationalStatusLabel(status: IdentityOperationalStatus) {
  return operationalStatusOptions.find((option) => option.value === status)?.label ?? "Desconfigurada";
}

function deteriorationLabel(identity: IdentitySummary) {
  if (identity.operationalStatus !== "active") return null;
  return identity.deteriorationLevel === 0
    ? "Sin deterioro"
    : `Deterioro ${identity.deteriorationLevel}`;
}

function CompanyPower({ company }: Readonly<{ company: IdentityCompanyPower }>) {
  const endOffset = Math.max(0, 100 - company.progress * 100);
  const style = {
    "--power-end": endOffset,
    "--power-start": Math.min(100, endOffset + 7),
  } as CSSProperties;
  return <article className={`identity-company-power${company.burned ? " is-burned" : ""}`} title={`${company.name}: ${company.payoutCount} payouts`}>
    <div className="identity-power-ring" style={style}>
      <svg aria-hidden viewBox="0 0 80 80"><circle className="identity-power-track" cx="40" cy="40" pathLength="100" r="31" /><circle className="identity-power-value" cx="40" cy="40" pathLength="100" r="31" /></svg>
      <strong>{company.payoutCount}</strong>
    </div>
    <span>{company.code}</span>
    <small>{company.burned ? "Quemada" : `${company.payoutCount}/4 payouts`}</small>
  </article>;
}

function IdentityBoard({ identities, ownerName }: Readonly<{ identities: IdentitySummary[]; ownerName: string }>) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [zoom, setZoom] = useState(.82);
  const hoverRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ originX: number; originY: number; panX: number; panY: number } | null>(null);
  const layout = useMemo(() => {
    const nodeWidth = 190;
    const gap = 42;
    const canvasWidth = Math.max(1160, 140 + identities.length * nodeWidth + Math.max(0, identities.length - 1) * gap);
    const firstX = identities.length
      ? (canvasWidth - (identities.length * nodeWidth + Math.max(0, identities.length - 1) * gap)) / 2
      : (canvasWidth - nodeWidth) / 2;
    const root = { x: (canvasWidth - nodeWidth) / 2, y: 56 };
    return {
      canvasWidth,
      children: identities.map((identity, index) => ({ identity, x: firstX + index * (nodeWidth + gap), y: 250 })),
      root,
    };
  }, [identities]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && hoverRef.current) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const center = () => {
    const width = viewportRef.current?.clientWidth ?? 0;
    if (width) setPan({ x: width / 2 - (layout.root.x + 95) * zoom, y: 0 });
  };
  useEffect(center, [layout, zoom]);
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!spaceHeld && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { originX: event.clientX, originY: event.clientY, panX: pan.x, panY: pan.y };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.panX + event.clientX - dragRef.current.originX, y: dragRef.current.panY + event.clientY - dragRef.current.originY });
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className="identity-board-shell" aria-labelledby="identity-board-title">
    <div className="identity-board-heading"><div><h3 id="identity-board-title">Mapa de identidades</h3><small>Explorá la estructura y desplegá el estado de cada identidad.</small></div><div className="identity-board-controls"><button disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, Number((value - .1).toFixed(1))))} type="button">−</button><output>{Math.round(zoom * 100)}%</output><button disabled={zoom >= 1.5} onClick={() => setZoom((value) => Math.min(1.5, Number((value + .1).toFixed(1))))} type="button">+</button><button className="identity-board-center" onClick={center} type="button">Centrar</button></div></div>
    <div className="identity-board-help">Mantené espacio y arrastrá para moverte por la pizarra.</div>
    <div className={`identity-board-viewport${spaceHeld ? " is-ready" : ""}`} onMouseEnter={() => { hoverRef.current = true; }} onMouseLeave={() => { hoverRef.current = false; setSpaceHeld(false); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} ref={viewportRef}>
      <div className="identity-board-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: layout.canvasWidth }}>
        <svg aria-hidden className="identity-board-lines" height="470" width={layout.canvasWidth}>{layout.children.map(({ identity, x, y }) => { const middleY = 184; return <path d={`M ${layout.root.x + 95} 126 V ${middleY} H ${x + 95} V ${y}`} key={identity.id} />; })}</svg>
        <article className="identity-board-node root" style={{ left: layout.root.x, top: layout.root.y }}><strong>{ownerName}</strong><small>{identities.length} {identities.length === 1 ? "identidad" : "identidades"}</small></article>
        {layout.children.map(({ identity, x, y }) => {
          const isExpanded = expanded.has(identity.id);
          const degradation = deteriorationLabel(identity);
          return <article className={`identity-board-node identity status-${identity.operationalStatus}${isExpanded ? " is-expanded" : ""}`} key={identity.id} style={{ left: x, top: y }}>
            <strong>{identity.firstName} {identity.lastName}</strong>
            <span>{operationalStatusLabel(identity.operationalStatus)}</span>
            <button aria-expanded={isExpanded} aria-label={`${isExpanded ? "Ocultar" : "Mostrar"} estado de ${identity.firstName} ${identity.lastName}`} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(identity.id)) next.delete(identity.id); else next.add(identity.id); return next; })} type="button">{isExpanded ? "−" : "+"}</button>
            {isExpanded ? <small className="identity-board-node-detail"><b>{degradation ?? "Estado manual"}</b><span>{identity.burnedCompanyCount} empresas quemadas</span><span>{identity.companyPowers.reduce((sum, company) => sum + company.payoutCount, 0)} payouts registrados</span></small> : null}
          </article>;
        })}
      </div>
    </div>
  </section>;
}

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}

function accountState(account: IdentityAccount) {
  if (account.state === "closed") return "Cerrada";
  if (account.state === "virgin") return "Virgen";
  return "Activa";
}

export function IdentitiesWorkspace({ accounts, connectors, identities, ownerName, signalStates, workspaceId }: Props) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const assignedIds = new Set(accounts.filter((account) => account.currentIdentityId).map((account) => account.id));
  const unassigned = accounts.filter((account) => !assignedIds.has(account.id));

  function run(action: () => Promise<{ message: string; ok: boolean }>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage("No se pudo completar la acción. Volvé a intentarlo.");
      }
    });
  }

  function saveOperationalStatus(
    identity: IdentitySummary,
    status: IdentityOperationalStatus,
    select: HTMLSelectElement,
  ) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateIdentityOperationalStatus(identity.id, status);
        setMessage(result.message);
        if (result.ok) router.refresh();
        else select.value = identity.operationalStatus;
      } catch {
        select.value = identity.operationalStatus;
        setMessage("No se pudo guardar el estado de la identidad.");
      }
    });
  }

  return (
    <section aria-labelledby="identities-title" className="identities-view" id="identidades">
      <div className="workspace-section-heading identities-heading">
        <h2 id="identities-title">Identidades</h2>
      </div>

      <form action={(formData) => run(async () => {
        const result = await createIdentityDirectly({
          email: String(formData.get("email") ?? ""),
          fullName: String(formData.get("full_name") ?? ""),
          workspaceId,
        });
        if (result.ok) createFormRef.current?.reset();
        return result;
      })} className="identity-create-form" ref={createFormRef}>
        <input aria-label="Nombre completo" autoComplete="name" maxLength={200} name="full_name" placeholder="Nombre completo" required />
        <input aria-label="Correo de la identidad" autoComplete="email" inputMode="email" maxLength={254} name="email" placeholder="correo@gmail.com" required type="email" />
        <button className="primary-action" disabled={pending} type="submit">{pending ? "Agregando…" : "Agregar"}</button>
      </form>
      {message && <p aria-live="polite" className="identity-message">{message}</p>}

      <IdentityBoard identities={identities} ownerName={ownerName} />

      <div className="identity-section-title"><h3>Identidades</h3><span>{identities.length}</span></div>
      <div className="identity-list">
        {identities.map((identity) => {
          const connector = connectors.find((candidate) => candidate.identityId === identity.id) ?? null;
          const installation = identity.connectorInstallation;
          const installationAvailable = installation !== null && installation.status !== "failed";
          const signalEnabled = signalStates[identity.id] ?? true;
          const signalAvailable = connector !== null;
          const liveAccounts = identity.accounts.filter((account) => account.state !== "closed").length;
          const closedAccounts = identity.accounts.filter((account) => account.state === "closed").length;
          const degradation = deteriorationLabel(identity);
          return <details className={`identity-card status-${identity.operationalStatus}`} id={`identity-${identity.id}`} key={identity.id}>
            <summary>
              <span><strong>{identity.firstName} {identity.lastName}</strong><small>{identity.contactEmail}</small></span>
              <span><small>Resultado</small><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></span>
              <span><small>Cuentas</small><strong>{identity.accounts.length}</strong></span>
              <label className="identity-status-selector" onClick={(event) => event.stopPropagation()}><small>Estado</small><select aria-label={`Estado de ${identity.firstName} ${identity.lastName}`} defaultValue={identity.operationalStatus} disabled={pending} onChange={(event) => saveOperationalStatus(identity, event.currentTarget.value as IdentityOperationalStatus, event.currentTarget)} onKeyDown={(event) => event.stopPropagation()}>
                {operationalStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <i aria-hidden="true" />
            </summary>
            <div className="identity-detail">
              <div className={`identity-operational-banner status-${identity.operationalStatus}`}><span><small>Estado operativo</small><strong>{operationalStatusLabel(identity.operationalStatus)}</strong></span>{identity.operationalStatus === "active" ? <b className={`deterioration-${identity.deteriorationLevel}`}>{degradation}</b> : <small>El deterioro se calcula únicamente cuando la identidad está activa.</small>}</div>
              <div className="identity-account-summary">
                <div><span>Resultado acumulado</span><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></div>
                <div><span>Payouts</span><strong>{money(identity.payoutTotalInCents)}</strong></div>
                <div><span>Cuentas vivas</span><strong>{liveAccounts}</strong></div>
                <div><span>Cuentas cerradas</span><strong>{closedAccounts}</strong></div>
              </div>

              <section className="identity-company-powers" aria-label={`Payouts por empresa de ${identity.firstName} ${identity.lastName}`}><div className="identity-company-powers-heading"><strong>Payouts</strong><b>{identity.burnedCompanyCount} quemadas</b></div><div className="identity-company-power-grid">{identity.companyPowers.map((company) => <CompanyPower company={company} key={company.id} />)}</div>{identity.companyPowers.length === 0 ? <p>Sin empresas de fondeo configuradas.</p> : null}</section>

              <div className="identity-connector-row">
                <span>
                  <small>NinjaTrader</small>
                  <strong>{connector?.isOnline
                    ? "Conectado"
                    : connector
                      ? "Sin señal"
                      : installation?.status === "downloaded" && installationAvailable
                        ? "Instalación descargada"
                        : installationAvailable
                          ? "Instalación enviada"
                          : "Sin vincular"}</strong>
                </span>
                <div className="identity-connector-actions">
                  {identity.onboardingStatus === "approved" && <NinjaConnectorPanel
                    compact
                    connector={connector}
                    pairingLabel="Generar código"
                    targetIdentityId={identity.id}
                  />}
                    <button
                      className="identity-installation-resend"
                      disabled={pending}
                      onClick={() => run(() => sendIdentityConnectorInstallation(identity.id))}
                      type="button"
                    >
                      {pending ? "Enviando…" : installationAvailable ? "Reenviar instalación" : "Enviar instalación"}
                    </button>
                </div>
              </div>

              <div className="identity-signal-row">
                <span><strong>Recepción de operaciones</strong><small>{signalAvailable ? signalEnabled ? "Activa" : "Pausada" : "Sin conector"}</small></span>
                <button aria-pressed={signalAvailable && signalEnabled} className={`identity-signal-toggle${signalAvailable && signalEnabled ? " is-on" : ""}`} disabled={pending || identity.onboardingStatus !== "approved" || !signalAvailable} onClick={() => run(() => setIdentitySignal(identity.id, !signalEnabled))} type="button">
                  {signalEnabled ? "Apagar" : "Encender"}
                </button>
              </div>

              <div className="identity-subsection-title"><strong>Billeteras</strong><span>{identity.wallets.length}</span></div>
              <div className="identity-wallet-list">
                {identity.wallets.length === 0 ? <p>Sin billeteras asignadas.</p> : identity.wallets.map((wallet) => (
                  <div className="identity-wallet-row" key={wallet.id}>
                    <strong>{wallet.name}</strong>
                    <span>{money(wallet.balanceInCents)}</span>
                  </div>
                ))}
              </div>

              <div className="identity-subsection-title"><strong>Cuentas</strong><span>{identity.accounts.length}</span></div>
              <div className="identity-assigned-accounts">
                {identity.accounts.length === 0 ? <p>Sin cuentas asignadas.</p> : identity.accounts.map((account) => (
                  <details className="identity-account-card" key={account.id}>
                    <summary>
                      <span><strong>{account.label}</strong><small>{accountState(account)}{account.operationalState ? ` · ${account.operationalState}` : ""}</small></span>
                      <span><small>Cash value</small><strong>{account.balanceInCents === null ? "—" : money(account.balanceInCents)}</strong></span>
                      <strong className={account.resultInCents < 0 ? "negative" : undefined}>{money(account.resultInCents)}</strong>
                      <i aria-hidden="true" />
                    </summary>
                    <div className="identity-account-detail">
                      <div className="identity-account-facts">
                        <span><small>Trades</small><strong>{account.tradeCount}</strong></span>
                        <span><small>Payouts</small><strong>{money(account.payoutInCents)}</strong></span>
                        <span><small>Resultado</small><strong className={account.resultInCents < 0 ? "negative" : undefined}>{money(account.resultInCents)}</strong></span>
                      </div>
                      {account.history.length > 0 && <div className="identity-account-history">
                        <div className="identity-account-history-head"><span>N°</span><span>Etapa</span><span>Prop</span><span>Broker</span><span>Acumulado</span><span>Concepto</span></div>
                        {account.history.map((row, index) => <div className="identity-account-history-row" key={`${row.concept}-${row.tradeNumber ?? 0}-${index}`}>
                          <span>{row.tradeNumber ?? "—"}</span>
                          <span>{row.phase}</span>
                          <span>{row.propResultInCents === null ? "—" : money(row.propResultInCents)}</span>
                          <span>{row.brokerResultInCents === null ? "—" : money(row.brokerResultInCents)}</span>
                          <strong>{money(row.accumulatedInCents)}</strong>
                          <span>{row.concept}</span>
                        </div>)}
                      </div>}
                      <button className="identity-unassign" disabled={pending} onClick={() => run(() => unassignIdentityAccount(identity.id, account.id))} type="button">Quitar asignación</button>
                    </div>
                  </details>
                ))}
              </div>

              <form action={(formData) => run(() => assignIdentityAccount(identity.id, String(formData.get("account_id") ?? "")))} className="identity-assignment-form">
                <select aria-label="Cuenta sin titular" defaultValue="" name="account_id" required>
                  <option disabled value="">Asignar cuenta</option>
                  {unassigned.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                </select>
                <button className="primary-action" disabled={pending || unassigned.length === 0} type="submit">Asignar</button>
              </form>
            </div>
          </details>
        })}
        {identities.length === 0 && <p className="identity-empty-row">Sin identidades aprobadas.</p>}
      </div>
    </section>
  );
}
