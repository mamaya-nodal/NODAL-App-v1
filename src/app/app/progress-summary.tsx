"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { buildSummaryAlerts } from "@/modules/summary/domain/summary-alerts";
import { buildConciliationBreakdown } from "@/modules/summary/domain/conciliation-breakdown";
import {
  collectFundingWithdrawal,
  createWallet,
  createFundingWithdrawal,
  createWalletMovement,
  renameWallet,
} from "./summary-actions";
import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";

type Props = Readonly<{
  accounts: Array<{ id: string; label: string }>;
  embedded?: boolean;
  economicTrace?: EconomicTraceItem[];
  liveBrokerBalance?: NinjaLiveBrokerBalance | null;
  ninjaOnline?: boolean;
  periodLabel?: string;
  periods?: AccountingPeriodView[];
  periodId: string;
  summary: OperationalSummary;
  wallets: WalletView[];
}>;

export type WalletView = Readonly<{
  balanceInCents: number;
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
  }).format(cents / 100);

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
} as const;

export function ProgressSummary({ accounts, economicTrace = [], embedded = false, liveBrokerBalance = null, ninjaOnline = false, periodId, periodLabel, periods = [], summary, wallets }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [walletDraftName, setWalletDraftName] = useState("");
  const [walletEditingId, setWalletEditingId] = useState<string | null>(null);
  const [walletSavingId, setWalletSavingId] = useState<string | null>(null);
  const [walletFeedback, setWalletFeedback] = useState<Record<string, string>>({});
  const [walletNames, setWalletNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.name])),
  );
  const [movementKind, setMovementKind] = useState<keyof typeof labels>("external_contribution");
  const [liveBalance, setLiveBalance] = useState(liveBrokerBalance);
  const [liveOnline, setLiveOnline] = useState(ninjaOnline);
  const alerts = buildSummaryAlerts(summary);
  const conciliation = buildConciliationBreakdown(summary);
  const hasConciliationDifference =
    conciliation.capital.differenceInCents !== 0 ||
    conciliation.gains.differenceInCents !== 0;
  const recentPeriods = periods.slice(0, 2);
  const archivedPeriods = periods.slice(2);

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
    const result = await createWalletMovement({
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

  async function addWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await createWallet({
      date: String(form.get("date") ?? ""),
      name: String(form.get("name") ?? ""),
      openingBalance: String(form.get("opening_balance") ?? ""),
      periodId,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) { event.currentTarget.reset(); router.refresh(); }
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
      collectedOn: today(),
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
        <article>
          <span>Saldo broker</span>
          <strong>{liveBalance ? money(liveBalance.balanceInCents) : summary.brokerBalanceInCents === null ? "—" : money(summary.brokerBalanceInCents)}</strong>
          <small>{liveBalance ? liveOnline ? "En vivo" : "Último dato" : "Sin datos de Ninja"}</small>
        </article>
        <article><span>Comisión de usuario</span><strong>{money(summary.commissionInCents)}</strong><small>{summary.commissionRateLabel}</small></article>
        <article><span>Ganancia del usuario</span><strong>{money(summary.traderGainInCents)}</strong></article>
      </div>

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
        <summary><span>Otros saldos</span><strong>{money(summary.walletBalanceInCents)}</strong><i aria-hidden="true" /></summary>
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
              <div className="named-wallet-balance"><span>Saldo disponible</span><strong>{money(wallet.balanceInCents)}</strong></div>
            </div>
          ))}
          <p><span>Total billeteras</span><strong>{money(summary.walletBalanceInCents)}</strong></p>
          <p><span>Payouts pendientes</span><strong>{money(summary.fundingPendingInCents)}</strong></p>
          <p><span>Capital neto aportado</span><strong>{money(summary.capitalNetInCents)}</strong></p>
          <p><span>Flotante</span><strong>{money(summary.floatingInCents)}</strong></p>
          <details className="wallet-create-inline">
            <summary>+ Agregar billetera</summary>
            <form className="summary-form" onSubmit={addWallet}>
              <input name="name" placeholder="Nombre de la billetera" required />
              <input defaultValue={today()} name="date" required type="date" />
              <input inputMode="decimal" name="opening_balance" placeholder="Saldo inicial USD (opcional)" />
              <button disabled={saving}>Crear billetera</button>
            </form>
          </details>
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

      <details className="accounting-disclosure demo-operation-disclosure" open={hasConciliationDifference ? true : undefined}>
        <summary>
          <span>Conciliaciones</span>
          <strong>{hasConciliationDifference ? "Revisar" : "Sin diferencias"}</strong>
        </summary>
        <div className="conciliation-grid">
          <ConciliationCard
            difference={conciliation.capital.differenceInCents}
            leftLines={conciliation.capital.observable}
            leftTitle="Posición observable"
            leftTotal={summary.positionObservableInCents}
            rightLines={conciliation.capital.expected}
            rightTitle="Posición esperada"
            rightTotal={summary.positionExpectedInCents}
            title="Capital"
          />
          <ConciliationCard
            difference={conciliation.gains.differenceInCents}
            leftLines={[]}
            leftTitle="Cuentas cerradas"
            leftTotal={conciliation.gains.closedInCents}
            rightLines={conciliation.gains.reconstructed}
            rightTitle="Ganancia reconstruida"
            rightTotal={summary.realizedGainInCents - conciliation.gains.differenceInCents}
            title="Ganancias"
          />
        </div>
      </details>

      <div className="accounting-actions">
        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Movimientos de billetera</span>
            <strong>{summary.walletMovements.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={wallet}>
            <select defaultValue={wallets[0]?.id ?? ""} name="wallet" required>
              <option disabled value="">Billetera</option>
              {wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input defaultValue={today()} name="date" required type="date" />
            <select name="kind" onChange={(event) => setMovementKind(event.target.value as keyof typeof labels)} value={movementKind}>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input inputMode="decimal" name="amount" placeholder="Importe USD" required />
            {(movementKind === "broker_to_wallet" || movementKind === "wallet_to_broker") && (
              <input inputMode="decimal" min="0" name="fee" placeholder="Fee real USD (opcional)" />
            )}
            <input name="observation" placeholder="Observación (opcional)" />
            <button disabled={saving}>Guardar movimiento</button>
          </form>
          {summary.walletMovements.length > 0 && (
            <div className="summary-list">
              {summary.walletMovements.map((movement) => (
                <p key={movement.id}>
                  <strong>{date(movement.occurredOn)}</strong> · {wallets.find((wallet) => wallet.id === movement.walletId)?.name ?? "Billetera"} · {labels[movement.kind as keyof typeof labels] ?? "Movimiento de billetera"} · {money(movement.amountInCents)}{(movement.feeInCents ?? 0) > 0 ? ` · Fee ${money(movement.feeInCents ?? 0)}` : ""}
                </p>
              ))}
            </div>
          )}
        </details>

        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Payouts</span>
            <strong>{summary.fundingWithdrawals.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={withdrawal}>
            <select defaultValue="" name="account" required>
              <option disabled value="">Cuenta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.label}</option>
              ))}
            </select>
            <input defaultValue={today()} name="approved_on" required type="date" />
            <input inputMode="decimal" name="amount" placeholder="Importe aprobado" required />
            <button disabled={saving}>Registrar payout</button>
          </form>
          {summary.fundingWithdrawals.length > 0 && (
            <div className="summary-list">
              {summary.fundingWithdrawals.map((item) => (
                <div className="payout-list-row" key={item.id}>
                  <p><strong>{date(item.approvedOn)}</strong> · {money(item.amountInCents)}{item.phase ? ` · ${item.phase}` : ""}</p>
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
  difference,
  leftLines,
  leftTitle,
  leftTotal,
  rightLines,
  rightTitle,
  rightTotal,
  title,
}: {
  difference: number;
  leftLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  leftTitle: string;
  leftTotal: number;
  rightLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  rightTitle: string;
  rightTotal: number;
  title: string;
}) {
  return (
    <article className="conciliation-card">
      <h4>{title}</h4>
      <div className="conciliation-sides">
        <ConciliationSide lines={leftLines} title={leftTitle} total={leftTotal} />
        <ConciliationSide lines={rightLines} title={rightTitle} total={rightTotal} />
      </div>
      <p className={`conciliation-difference${difference !== 0 ? " has-difference" : ""}`}>
        <span>Diferencia</span>
        <strong>{money(difference)}</strong>
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
  total: number;
}) {
  return (
    <div className="conciliation-side">
      <strong>{title}</strong>
      {lines.map((line) => (
        <p key={line.label}>
          <a href={line.href}>{line.label}</a>
          <span>{line.valueInCents === null ? "Sin saldo informado" : money(line.valueInCents)}</span>
        </p>
      ))}
      <footer>
        <span>Total</span>
        <strong>{money(total)}</strong>
      </footer>
    </div>
  );
}
