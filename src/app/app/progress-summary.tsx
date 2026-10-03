"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import { clampDateToPeriodSchedule } from "@/modules/accounting/domain/period-calendar";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { presentWalletBalances } from "@/modules/wallets/domain/balance-presentation";
import { buildSummaryAlerts } from "@/modules/summary/domain/summary-alerts";
import { buildConciliationBreakdown, sumConciliationLines } from "@/modules/summary/domain/conciliation-breakdown";
import {
  collectFundingWithdrawal,
  createFundingWithdrawal,
  createWalletMovement,
  createWalletTransfer,
  removeWallet,
  renameWallet,
} from "./summary-actions";
import { assignWalletIdentity, refreshWalletSource } from "./wallet-source-actions";
import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";
import { WalletConnections } from "./wallet-connections";

type Props = Readonly<{
  accounts: Array<{ eligibleForPayout: boolean; id: string; label: string }>;
  embedded?: boolean;
  economicTrace?: EconomicTraceItem[];
  liveBrokerBalance?: NinjaLiveBrokerBalance | null;
  ninjaOnline?: boolean;
  periodLabel?: string;
  periods?: AccountingPeriodView[];
  periodId: string;
  periodOperationalStartOn?: string;
  periodScheduledCloseAt?: string;
  identities?: WalletIdentityView[];
  summary: OperationalSummary;
  wallets: WalletView[];
}>;

export type WalletView = Readonly<{
  automatic: boolean;
  balanceInCents: number;
  id: string;
  identityId: string | null;
  name: string;
  observedBalanceInCents: number | null;
}>;

export type WalletIdentityView = Readonly<{
  id: string;
  name: string;
}>;

export type EconomicTraceItem = Readonly<{
  amountInCents: number;
  date: string;
  id: string;
  label: string;
  source: "Automático" | "Manual";
  status?: string | null;
}>;

export type AccountingPeriodView = Readonly<{
  current: boolean;
  label: string;
  summary: Pick<
    OperationalSummary,
    "commissionInCents" | "periodResultInCents" | "realizedGainInCents" | "traderGainInCents"
  >;
}>;

const money = (cents: number) =>
  new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format((cents || 0) / 100);

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(new Date());

const date = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

const labels = {
  external_contribution: "Aporte externo a billetera",
  personal_withdrawal: "Retiro personal desde billetera",
  broker_to_wallet: "Transferencia broker → billetera",
  wallet_to_broker: "Transferencia billetera → broker",
  wallet_to_wallet: "Transferencia entre billeteras",
} as const;

export function ProgressSummary({ accounts, economicTrace = [], embedded = false, identities = [], liveBrokerBalance = null, ninjaOnline = false, periodId, periodLabel, periodOperationalStartOn, periodScheduledCloseAt, periods = [], summary, wallets }: Props) {
  const router = useRouter();
  const payoutAccounts = accounts.filter((account) => account.eligibleForPayout);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [walletDraftName, setWalletDraftName] = useState("");
  const [walletEditingId, setWalletEditingId] = useState<string | null>(null);
  const [movementWalletId, setMovementWalletId] = useState(wallets[0]?.id ?? "");
  const [walletSavingId, setWalletSavingId] = useState<string | null>(null);
  const [walletFeedback, setWalletFeedback] = useState<Record<string, string>>({});
  const [walletNames, setWalletNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.name])),
  );
  const [walletIdentityIds, setWalletIdentityIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.identityId ?? ""])),
  );
  const [movementKind, setMovementKind] = useState<keyof typeof labels>("external_contribution");
  const [liveBalance, setLiveBalance] = useState(liveBrokerBalance);
  const [liveOnline, setLiveOnline] = useState(ninjaOnline);
  const walletBalances = presentWalletBalances(wallets.map((wallet) => ({
    accountingInCents: wallet.balanceInCents,
    automatic: wallet.automatic,
    observedInCents: wallet.observedBalanceInCents,
  })));
  const alerts = buildSummaryAlerts(summary);
  const conciliation = buildConciliationBreakdown(summary);
  const hasConciliationDifference =
    conciliation.capital.differenceInCents !== 0 ||
    conciliation.gains.differenceInCents !== 0 ||
    walletBalances.differenceInCents !== 0;
  const hasUnverifiedConciliation = !conciliation.capital.verified || !conciliation.gains.verified || !walletBalances.verified;
  const recentPeriods = periods.slice(0, 2);
  const archivedPeriods = periods.slice(2);
  const defaultBusinessDate = periodOperationalStartOn && periodScheduledCloseAt
    ? clampDateToPeriodSchedule(today(), periodOperationalStartOn, periodScheduledCloseAt)
    : today();
  const maximumBusinessDate = periodScheduledCloseAt?.slice(0, 10);

  useEffect(() => {
    const receiveStatus = (event: Event) => {
      const detail = (event as CustomEvent<NinjaStatusEventDetail>).detail;
      setLiveOnline(detail.online);
      setLiveBalance(detail.liveBrokerBalance);
    };
    window.addEventListener(NINJA_STATUS_EVENT, receiveStatus);
    return () => window.removeEventListener(NINJA_STATUS_EVENT, receiveStatus);
  }, []);

  async function wallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = movementKind === "wallet_to_wallet"
      ? await createWalletTransfer({
        amount: String(form.get("amount") ?? ""),
        date: String(form.get("date") ?? ""),
        destinationWalletId: String(form.get("destination_wallet") ?? ""),
        fee: String(form.get("fee") ?? ""),
        observation: String(form.get("observation") ?? ""),
        periodId,
        sourceWalletId: String(form.get("wallet") ?? ""),
      })
      : await createWalletMovement({
        amount: String(form.get("amount") ?? ""),
        date: String(form.get("date") ?? ""),
        kind: String(form.get("kind") ?? ""),
        observation: String(form.get("observation") ?? ""),
        periodId,
        walletId: String(form.get("wallet") ?? ""),
        fee: String(form.get("fee") ?? ""),
      });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) {
      event.currentTarget.reset();
      setMovementKind("external_contribution");
      router.refresh();
    }
  }

  async function updateWalletName(event: FormEvent<HTMLFormElement>, walletId: string) {
    event.preventDefault();
    const name = walletDraftName.trim();
    setWalletSavingId(walletId);
    setWalletFeedback((current) => ({ ...current, [walletId]: "" }));
    const result = await renameWallet({ name, walletId });
    setWalletSavingId(null);
    if (result.ok) {
      setWalletNames((current) => ({ ...current, [walletId]: name }));
      setWalletFeedback((current) => ({ ...current, [walletId]: "" }));
      setWalletDraftName("");
      setWalletEditingId(null);
      router.refresh();
      return;
    }
    setWalletFeedback((current) => ({ ...current, [walletId]: result.message }));
  }

  async function updateWalletIdentity(walletId: string, identityId: string) {
    const previous = walletIdentityIds[walletId] ?? "";
    setWalletIdentityIds((current) => ({ ...current, [walletId]: identityId }));
    setWalletSavingId(walletId);
    setWalletFeedback((current) => ({ ...current, [walletId]: "" }));
    const result = await assignWalletIdentity(walletId, identityId);
    setWalletSavingId(null);
    if (!result.ok) setWalletIdentityIds((current) => ({ ...current, [walletId]: previous }));
    setWalletFeedback((current) => ({ ...current, [walletId]: result.message }));
    if (result.ok) router.refresh();
  }

  async function deleteWallet(wallet: WalletView) {
    if (!window.confirm(`¿Eliminar ${walletNames[wallet.id] ?? wallet.name}?`)) return;
    setWalletSavingId(wallet.id);
    setWalletFeedback((current) => ({ ...current, [wallet.id]: "" }));
    const result = await removeWallet(wallet.id);
    setWalletSavingId(null);
    setWalletFeedback((current) => ({ ...current, [wallet.id]: result.message }));
    if (result.ok) router.refresh();
  }

  async function refreshWallet(walletId: string) {
    setWalletSavingId(walletId);
    setWalletFeedback((current) => ({ ...current, [walletId]: "" }));
    const result = await refreshWalletSource(walletId);
    setWalletSavingId(null);
    setWalletFeedback((current) => ({ ...current, [walletId]: result.message }));
    if (result.ok) router.refresh();
  }

  async function withdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await createFundingWithdrawal({
      accountId: String(form.get("account") ?? ""),
      amount: String(form.get("amount") ?? ""),
      approvedOn: String(form.get("approved_on") ?? ""),
      periodId,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function collect(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await collectFundingWithdrawal({
      collectedOn: defaultBusinessDate,
      fee: String(form.get("fee") ?? ""),
      periodId,
      walletId: String(form.get("wallet") ?? ""),
      withdrawalId: id,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <section
      aria-label={embedded ? "Resumen contable" : undefined}
      aria-labelledby={embedded ? undefined : "progress-summary-title"}
      className="progress-summary-panel"
      id="resumen"
    >
      {!embedded && (
        <div className="summary-heading">
          <h2 id="progress-summary-title">Contabilidad</h2>
        </div>
      )}

      <div className="demo-accounting-grid">
        <article className="demo-accounting-primary">
          <span>Facturación</span>
          <strong>{money(summary.realizedGainInCents)}</strong>
          {periodLabel && <small>{periodLabel}</small>}
        </article>
        <article><span>Resultado del período</span><strong>{money(summary.periodResultInCents)}</strong></article>
        <article><span>Resultado acumulado</span><strong>{money(summary.accumulatedResultInCents)}</strong><small>Incluye períodos anteriores</small></article>
        <article>
          <span>Saldo broker contable</span>
          <strong>{summary.brokerBalanceInCents === null ? "—" : money(summary.brokerBalanceInCents)}</strong>
          <small>{liveBalance ? `Ninja: ${money(liveBalance.balanceInCents)} · ${liveOnline ? "En vivo" : "Último dato"}` : "Sin datos de Ninja"}</small>
        </article>
        <article><span>Comisión sobre tu operativa</span><strong>{money(summary.commissionInCents)}</strong><small>{summary.commissionRateLabel}</small></article>
        <article><span>Ganancia por operativa propia</span><strong>{money(summary.traderGainInCents)}</strong></article>
      </div>

      <details className="demo-operation-disclosure accounting-result-detail">
        <summary><span>Detalle del resultado acumulado</span><strong>{money(summary.accumulatedResultInCents)}</strong><i aria-hidden="true" /></summary>
        <div className="conciliation-grid">
          <ConciliationSide lines={conciliation.accumulated.lines} title={conciliation.accumulated.complete ? "Composición del resultado" : "Continuidad del resultado"} total={conciliation.accumulated.total} />
          <div className="conciliation-side">
            <strong>Cuentas vivas y vírgenes</strong>
            <p><span>Flotante al inicio</span><span>{summary.resultDetails ? money(summary.resultDetails.openingLiveResultInCents) : "No disponible"}</span></p>
            <p><span>Flotante actual</span><span>{summary.resultDetails ? money(summary.resultDetails.liveResultInCents) : "No disponible"}</span></p>
            <p><span>Costo de vírgenes al inicio</span><span>{summary.resultDetails ? money(summary.resultDetails.openingVirginPriceInCents) : "No disponible"}</span></p>
            <p><span>Costo de vírgenes actual</span><span>{money(summary.virginPriceInCents)}</span></p>
            <small>El flotante conserva su signo. Para el resultado del período se toma su variación, no se vuelve a contar el saldo inicial.</small>
            {!conciliation.accumulated.complete && <p>El desglose histórico completo no está disponible; no se infieren importes para completarlo.</p>}
          </div>
        </div>
      </details>

      {((summary.priorPeriodResultAdjustmentInCents ?? 0) !== 0
        || (summary.priorPeriodCommissionAdjustmentInCents ?? 0) !== 0) && (
        <div className="prior-period-adjustment" role="note">
          <div><span>Ajuste de período anterior</span><strong>{money(summary.priorPeriodResultAdjustmentInCents ?? 0)}</strong></div>
          <div><span>Ajuste de comisión anterior</span><strong>{money(summary.priorPeriodCommissionAdjustmentInCents ?? 0)}</strong></div>
          <small>Rectificación aprobada por Admin Master. Se muestra separada del resultado operativo actual.</small>
        </div>
      )}

      {periods.length > 0 && (
        <>
          <div className="demo-periods-heading"><h3>Períodos</h3><span>{periods.length}</span></div>
          <div className="demo-period-cards">
            {recentPeriods.map((period) => (
              <article className={period.current ? "current" : undefined} key={period.label}>
                <div><strong>{period.label}</strong><span>{period.current ? "Actual" : "Cerrado"}</span></div>
                <dl>
                  <div><dt>Facturación</dt><dd>{money(period.summary.realizedGainInCents)}</dd></div>
                  <div><dt>Comisión</dt><dd>{money(period.summary.commissionInCents)}</dd></div>
                  <div><dt>Ganancia usuario</dt><dd>{money(period.summary.traderGainInCents)}</dd></div>
                  <div><dt>Resultado período</dt><dd>{money(period.summary.periodResultInCents)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          {archivedPeriods.length > 0 && (
            <details className="demo-operation-disclosure accounting-period-archive">
              <summary><span>Períodos anteriores</span><strong>{archivedPeriods.length}</strong><i aria-hidden="true" /></summary>
              <div className="demo-period-cards">
                {archivedPeriods.map((period) => (
                  <article key={period.label}>
                    <div><strong>{period.label}</strong><span>Cerrado</span></div>
                    <dl>
                      <div><dt>Facturación</dt><dd>{money(period.summary.realizedGainInCents)}</dd></div>
                      <div><dt>Comisión</dt><dd>{money(period.summary.commissionInCents)}</dd></div>
                      <div><dt>Ganancia usuario</dt><dd>{money(period.summary.traderGainInCents)}</dd></div>
                      <div><dt>Resultado período</dt><dd>{money(period.summary.periodResultInCents)}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {alerts.length > 0 && (
        <div className="summary-section summary-alerts" aria-live="polite">
          <h3>Requiere atención</h3>
          <div className="summary-alert-list">
            {alerts.map((alert) => (
              <article className={`summary-alert summary-alert-${alert.severity}`} key={alert.code}>
                <div className="summary-alert-copy">
                  <strong>{liveBalance && alert.code === "missing_broker_balance" ? "Registrar saldo inicial" : alert.title}</strong>
                  <p>{liveBalance && alert.code === "missing_broker_balance" ? `Ninja informa ${money(liveBalance.balanceInCents)}; falta incorporarlo al período.` : alert.detail}</p>
                </div>
                <a href={alert.href}>Revisar</a>
              </article>
            ))}
          </div>
        </div>
      )}

      <details className="demo-operation-disclosure accounting-balances">
        <summary><span>Otros saldos</span><strong>{money(walletBalances.availableInCents)}</strong><i aria-hidden="true" /></summary>
        <div className="demo-wallets">
          {wallets.map((wallet) => (
            <div className="named-wallet-row" key={wallet.id}>
              {walletEditingId === wallet.id ? (
                <form onSubmit={(event) => updateWalletName(event, wallet.id)}>
                  <label htmlFor={`wallet-name-${wallet.id}`}>Nombre de la billetera</label>
                  <div>
                    <input
                      aria-label={`Nombre de ${wallet.name}`}
                      autoFocus
                      id={`wallet-name-${wallet.id}`}
                      maxLength={80}
                      name="name"
                      onChange={(event) => setWalletDraftName(event.target.value)}
                      value={walletDraftName}
                    />
                    <button
                      className="wallet-edit-cancel"
                      disabled={walletSavingId === wallet.id}
                      onClick={() => {
                        setWalletEditingId(null);
                        setWalletDraftName("");
                        setWalletFeedback((current) => ({ ...current, [wallet.id]: "" }));
                      }}
                      type="button"
                    >Cancelar</button>
                    <button
                      disabled={walletSavingId === wallet.id || !walletDraftName.trim() || walletDraftName.trim() === (walletNames[wallet.id] ?? wallet.name)}
                      type="submit"
                    >
                      {walletSavingId === wallet.id ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                  {walletFeedback[wallet.id] && <small role="status">{walletFeedback[wallet.id]}</small>}
                </form>
              ) : (
                <div className="named-wallet-display">
                  <span>Nombre de la billetera</span>
                  <div>
                    <strong>{walletNames[wallet.id] ?? wallet.name}</strong>
                    <button
                      className="wallet-edit-button"
                      onClick={() => {
                        setWalletFeedback((current) => ({ ...current, [wallet.id]: "" }));
                        setWalletDraftName(walletNames[wallet.id] ?? wallet.name);
                        setWalletEditingId(wallet.id);
                      }}
                      type="button"
                    >Editar nombre</button>
                  </div>
                </div>
              )}
              <label className="named-wallet-owner">
                <span>Asignada a</span>
                <select
                  aria-label={`Asignación de ${wallet.name}`}
                  disabled={walletSavingId === wallet.id}
                  onChange={(event) => void updateWalletIdentity(wallet.id, event.target.value)}
                  value={walletIdentityIds[wallet.id] ?? ""}
                >
                  <option value="">Titular</option>
                  {identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.name}</option>)}
                </select>
              </label>
              <div className="named-wallet-balance">
                <span>{wallet.automatic ? "Saldo detectado" : "Saldo contable"}</span>
                <strong>{money(wallet.automatic && wallet.observedBalanceInCents !== null ? wallet.observedBalanceInCents : wallet.balanceInCents)}</strong>
                {wallet.automatic && <small>Contable {money(wallet.balanceInCents)}</small>}
              </div>
              <div className="named-wallet-actions">
                {wallet.automatic && <button
                  className="wallet-refresh-button"
                  disabled={walletSavingId === wallet.id}
                  onClick={() => void refreshWallet(wallet.id)}
                  type="button"
                >{walletSavingId === wallet.id ? "Actualizando…" : "Actualizar"}</button>}
                <button
                  className="wallet-delete-button"
                  disabled={walletSavingId === wallet.id}
                  onClick={() => void deleteWallet(wallet)}
                  type="button"
                >Eliminar</button>
              </div>
              {walletFeedback[wallet.id] && walletEditingId !== wallet.id && <small className="named-wallet-feedback" role="status">{walletFeedback[wallet.id]}</small>}
            </div>
          ))}
          <p><span>Saldo disponible</span><strong>{money(walletBalances.availableInCents)}</strong></p>
          <p><span>Saldo contable</span><strong>{money(summary.walletBalanceInCents)}</strong></p>
          {walletBalances.differenceInCents !== 0 && <p className="wallet-balance-difference"><span>Diferencia por conciliar</span><strong>{money(walletBalances.differenceInCents)}</strong></p>}
          <p><span>Payouts pendientes</span><strong>{money(summary.fundingPendingInCents)}</strong></p>
          <p><span>Capital neto aportado</span><strong>{money(summary.capitalNetInCents)}</strong></p>
          <WalletConnections
            defaultDate={defaultBusinessDate}
            key={periodId}
            maxDate={maximumBusinessDate}
            minDate={periodOperationalStartOn}
            periodId={periodId}
            wallets={wallets}
          />
        </div>
      </details>

      {economicTrace.length > 0 && (
        <details className="demo-operation-disclosure accounting-economic-trace">
          <summary><span>Movimientos económicos</span><strong>{economicTrace.length}</strong><i aria-hidden="true" /></summary>
          <div className="economic-trace-list">
            {economicTrace.map((item) => (
              <article key={item.id}>
                <div><strong>{item.label}</strong><span>{date(item.date)} · {item.source}{item.status ? ` · ${item.status}` : ""}</span></div>
                <strong>{money(item.amountInCents)}</strong>
              </article>
            ))}
          </div>
        </details>
      )}

      <details className="accounting-disclosure demo-operation-disclosure" open={hasConciliationDifference || hasUnverifiedConciliation ? true : undefined}>
        <summary>
          <span>Conciliaciones</span>
          <strong>{hasUnverifiedConciliation ? "Pendiente de verificar" : hasConciliationDifference ? "Revisar" : "Sin diferencias"}</strong>
        </summary>
        <div className="conciliation-grid">
          <ConciliationCard
            difference={conciliation.capital.differenceInCents}
            verified={conciliation.capital.verified}
            leftLines={conciliation.capital.observable}
            leftTitle="Posición observable"
            leftTotal={sumConciliationLines(conciliation.capital.observable)}
            rightLines={conciliation.capital.expected}
            rightTitle="Posición esperada"
            rightTotal={sumConciliationLines(conciliation.capital.expected)}
            title="Capital"
          />
          <ConciliationCard
            difference={conciliation.gains.differenceInCents}
            verified={conciliation.gains.verified}
            leftLines={conciliation.gains.ledger}
            leftTitle="Según movimientos del período"
            leftTotal={conciliation.gains.ledgerTotal}
            rightLines={conciliation.gains.reconstructed}
            rightTitle="Según cuentas y arrastres"
            rightTotal={conciliation.gains.reconstructedTotal}
            title="Resultado del período"
          />
          {wallets.some((wallet) => wallet.automatic) && <ConciliationCard
            difference={walletBalances.differenceInCents}
            verified={walletBalances.verified}
            leftLines={[{ href: "#contabilidad", label: "Saldo disponible", valueInCents: walletBalances.availableInCents }]}
            leftTitle="Lectura actual"
            leftTotal={walletBalances.availableInCents}
            rightLines={[{ href: "#contabilidad", label: "Saldo contable", valueInCents: walletBalances.accountingInCents }]}
            rightTitle="Según movimientos registrados"
            rightTotal={walletBalances.accountingInCents}
            title="Billeteras"
          />}
        </div>
      </details>

      <div className="accounting-actions">
        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Movimientos de billetera</span>
            <strong>{summary.walletMovements.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={wallet}>
            <select name="wallet" onChange={(event) => setMovementWalletId(event.target.value)} required value={movementWalletId}>
              <option disabled value="">Billetera</option>
              {wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input defaultValue={defaultBusinessDate} max={maximumBusinessDate} min={periodOperationalStartOn} name="date" required type="date" />
            <select name="kind" onChange={(event) => setMovementKind(event.target.value as keyof typeof labels)} value={movementKind}>
              {Object.entries(labels).map(([value, label]) => (
                <option disabled={value === "wallet_to_wallet" && wallets.length < 2} key={value} value={value}>{label}</option>
              ))}
            </select>
            {movementKind === "wallet_to_wallet" && (
              <select defaultValue="" name="destination_wallet" required>
                <option disabled value="">Billetera de destino</option>
                {wallets.filter((item) => item.id !== movementWalletId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <input inputMode="decimal" name="amount" placeholder={movementKind === "wallet_to_wallet" ? "Importe debitado del origen USD" : "Importe USD"} required />
            {(movementKind === "broker_to_wallet" || movementKind === "wallet_to_broker" || movementKind === "wallet_to_wallet") && (
              <input inputMode="decimal" min="0" name="fee" placeholder={movementKind === "wallet_to_wallet" ? "Fee incluido en el débito USD" : "Fee real USD (opcional)"} />
            )}
            <input name="observation" placeholder="Observación (opcional)" />
            <button disabled={saving}>Guardar movimiento</button>
          </form>
          {summary.walletMovements.length > 0 && (
            <details className="wallet-movement-history">
              <summary><span>Ver historial de movimientos</span><strong>{summary.walletMovements.length}</strong></summary>
              <div className="summary-list">
                {summary.walletMovements.map((movement) => (
                  <p key={movement.id}>
                    <strong>{date(movement.occurredOn)}</strong> · {wallets.find((wallet) => wallet.id === movement.walletId)?.name ?? "Billetera"}{movement.kind === "wallet_to_wallet" ? ` → ${wallets.find((wallet) => wallet.id === movement.destinationWalletId)?.name ?? "Billetera"}` : ""} · {labels[movement.kind as keyof typeof labels] ?? "Movimiento de billetera"} · {money(movement.amountInCents)}{(movement.feeInCents ?? 0) > 0 ? ` · Fee ${money(movement.feeInCents ?? 0)}` : ""}
                  </p>
                ))}
              </div>
            </details>
          )}
        </details>

        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Payouts</span>
            <strong>{summary.fundingWithdrawals.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={withdrawal}>
            <select defaultValue="" disabled={payoutAccounts.length === 0} name="account" required>
              <option disabled value="">{payoutAccounts.length === 0 ? "Sin cuentas Funded vivas" : "Cuenta Funded viva"}</option>
              {payoutAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.label}</option>
              ))}
            </select>
            <input defaultValue={defaultBusinessDate} max={maximumBusinessDate} min={periodOperationalStartOn} name="approved_on" required type="date" />
            <input inputMode="decimal" name="amount" placeholder="Importe aprobado" required />
            <button disabled={saving || payoutAccounts.length === 0}>Registrar payout</button>
          </form>
          {summary.fundingWithdrawals.length > 0 && (
            <div className="summary-list">
              {summary.fundingWithdrawals.map((item) => (
                <div className="payout-list-row" key={item.id}>
                  <p><strong>{accounts.find((account) => account.id === item.accountId)?.label ?? "Cuenta no disponible"}</strong><span>{date(item.approvedOn)} · {money(item.amountInCents)}{item.phase ? ` · ${item.phase}` : ""}</span></p>
                  {item.collectedOn ? (
                    <span>Cobrado el {date(item.collectedOn)}{(item.feeInCents ?? 0) > 0 ? ` · Fee ${money(item.feeInCents ?? 0)}` : ""}</span>
                  ) : (
                    <form className="payout-collection-form" onSubmit={(event) => collect(event, item.id)}>
                      <select defaultValue={wallets[0]?.id ?? ""} name="wallet" required aria-label="Billetera de destino">
                        <option disabled value="">Billetera</option>
                        {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                      </select>
                      <input inputMode="decimal" min="0" name="fee" placeholder="Fee USD" />
                      <button className="text-action" disabled={saving || wallets.length === 0} type="submit">Confirmar cobro</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      </div>

      {message && <p className="register-feedback">{message}</p>}
    </section>
  );
}

function ConciliationCard({
  verified,
  difference,
  leftLines,
  leftTitle,
  leftTotal,
  rightLines,
  rightTitle,
  rightTotal,
  title,
}: {
  verified: boolean;
  difference: number | null;
  leftLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  leftTitle: string;
  leftTotal: number | null;
  rightLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  rightTitle: string;
  rightTotal: number | null;
  title: string;
}) {
  return (
    <article className="conciliation-card">
      <h4>{title}</h4>
      <div className="conciliation-sides">
        <ConciliationSide lines={leftLines} title={leftTitle} total={leftTotal} />
        <ConciliationSide lines={rightLines} title={rightTitle} total={rightTotal} />
      </div>
      <p className={`conciliation-difference${!verified || difference !== 0 ? " has-difference" : ""}`}>
        <span>Diferencia</span>
        <strong>{verified && difference !== null ? money(difference) : "No se pudo verificar"}</strong>
      </p>
    </article>
  );
}

function ConciliationSide({
  lines,
  title,
  total,
}: {
  lines: Array<{ href: string; label: string; valueInCents: number | null }>;
  title: string;
  total: number | null;
}) {
  return (
    <div className="conciliation-side">
      <strong>{title}</strong>
      {lines.map((line) => (
        <p key={line.label}>
          <a href={line.href}>{line.label}</a>
          <span>{line.valueInCents === null ? "No disponible" : money(line.valueInCents)}</span>
        </p>
      ))}
      <footer>
        <span>Total</span>
        <strong>{total === null ? "No disponible" : money(total)}</strong>
      </footer>
    </div>
  );
}
