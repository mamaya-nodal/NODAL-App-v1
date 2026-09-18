"use client";

import { useEffect, useState } from "react";

import type {
  CapitalHistoryPoint,
  HomePerformance,
} from "@/modules/summary/domain/home-dashboard";
import {
  buildPeriodEarnings,
  payoutDashboardSummary,
  type PersonalDashboardData,
} from "@/modules/summary/domain/personal-dashboard";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";
import { OpeningSetupPreview } from "./opening-setup-preview";

type HomeOverviewProps = Readonly<{
  capitalHistory: CapitalHistoryPoint[];
  dashboard?: PersonalDashboardData;
  liveBrokerBalance?: NinjaLiveBrokerBalance | null;
  ninjaOnline?: boolean;
  openingSetupPreview?: boolean;
  performance: HomePerformance;
  periodLabel: string;
  summary: OperationalSummary;
}>;

type ChartMetric = "billing" | "earnings";
type ChartPoint = Readonly<{ periodMonth: string; valueInCents: number }>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatMetric(cents: number | null): string {
  return cents === null ? "—" : formatMoney(cents);
}

function formatMonth(periodMonth: string) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    timeZone: "UTC",
    year: "2-digit",
  })
    .format(new Date(`${periodMonth.slice(0, 7)}-01T00:00:00Z`))
    .replace(".", "");
}

function chartGeometry(history: ChartPoint[]) {
  const width = 720;
  const height = 250;
  const left = 18;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const values = history.map((point) => point.valueInCents);
  const minimum = values.length ? Math.min(...values, 0) : 0;
  const maximum = values.length ? Math.max(...values, 0) : 1;
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number) => history.length <= 1
    ? width / 2
    : left + (index / (history.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((maximum - value) / span) * (height - top - bottom);
  const points = history.map((point, index) => ({ ...point, x: x(index), y: y(point.valueInCents) }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const baseline = height - bottom;
  const area = points.length
    ? `${line} L${points.at(-1)!.x.toFixed(1)} ${baseline} L${points[0].x.toFixed(1)} ${baseline} Z`
    : "";

  return { area, baseline, line, points };
}

function EarningsItem({ label, valueInCents }: Readonly<{ label: string; valueInCents: number }>) {
  return <div><span>{label}</span><strong>{formatMoney(valueInCents)}</strong></div>;
}

export function HomeOverview({ capitalHistory, dashboard, liveBrokerBalance = null, ninjaOnline = false, openingSetupPreview = false, performance, periodLabel, summary }: HomeOverviewProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>(dashboard ? "earnings" : "billing");
  const [liveBalance, setLiveBalance] = useState(liveBrokerBalance);
  const [liveOnline, setLiveOnline] = useState(ninjaOnline);
  const earnings = dashboard?.earnings ?? buildPeriodEarnings({ ownOperationsInCents: summary.traderGainInCents });
  const billingInCents = dashboard?.billingInCents ?? summary.realizedGainInCents;
  const payout = payoutDashboardSummary(summary.fundingWithdrawals);
  const history = dashboard?.history ?? [];
  const chartHistory = dashboard
    ? history.map((point) => ({
        periodMonth: point.periodMonth,
        valueInCents: chartMetric === "earnings" ? point.earningsInCents : point.billingInCents,
      }))
    : capitalHistory.map((point) => ({ periodMonth: point.periodMonth, valueInCents: point.capitalInCents }));
  const chart = chartGeometry(chartHistory);
  const chartTitle = dashboard
    ? chartMetric === "earnings" ? "Ganancias por período" : "Facturación por período"
    : "Capital histórico acumulado";
  const capabilities = dashboard?.capabilities;
  const hasCapabilities = Boolean(capabilities?.managedDesk || capabilities?.referredDesks || capabilities?.identities);

  useEffect(() => {
    const receiveStatus = (event: Event) => {
      const detail = (event as CustomEvent<NinjaStatusEventDetail>).detail;
      setLiveBalance(detail.liveBrokerBalance);
      setLiveOnline(detail.online);
    };
    window.addEventListener(NINJA_STATUS_EVENT, receiveStatus);
    return () => window.removeEventListener(NINJA_STATUS_EVENT, receiveStatus);
  }, []);

  return (
    <section aria-label="Inicio" className="home-overview-panel" id="inicio">
      {openingSetupPreview ? <OpeningSetupPreview autoOpen /> : null}
      {liveBalance && (
        <div className="home-live-status">
          <span className={liveOnline ? "online" : undefined}><i aria-hidden="true" />NinjaTrader {liveOnline ? "en vivo" : "último dato"}</span>
          <strong>Saldo broker {formatMoney(liveBalance.balanceInCents)}</strong>
        </div>
      )}
      <div className="home-financial-grid">
        <article className={`home-net-result${dashboard ? "" : " legacy"}`}>
          {dashboard ? <>
            <div className="home-earnings-topline">
              <small>{periodLabel}</small>
              {earnings.level !== null && <b>Nivel {earnings.level}</b>}
            </div>
            <span>Ganancias del período</span>
            <strong className={earnings.totalInCents < 0 ? "negative" : undefined}>
              {formatMoney(earnings.totalInCents)}
            </strong>
            <div className="home-earnings-breakdown">
              <EarningsItem label="Operaciones propias" valueInCents={earnings.ownOperationsInCents} />
              {earnings.deskAdministrationInCents !== null && (
                <EarningsItem label="Administración de mesa" valueInCents={earnings.deskAdministrationInCents} />
              )}
              {earnings.referredDesksInCents !== null && (
                <EarningsItem label="Mesas referidas" valueInCents={earnings.referredDesksInCents} />
              )}
            </div>
          </> : <>
            <span>Resultado neto</span>
            <strong className={summary.realizedGainInCents < 0 ? "negative" : undefined}>{formatMoney(summary.realizedGainInCents)}</strong>
            <small>{periodLabel}</small>
          </>}
        </article>

        <article className="home-financial-metric">
          <span>Facturación del período</span>
          <strong>{formatMoney(billingInCents)}</strong>
          <small>{periodLabel}</small>
        </article>

        <article className="home-financial-metric home-payout-metric">
          <span>Payouts</span>
          <strong>{payout.count} {dashboard && <b>({formatMoney(payout.totalInCents)})</b>}</strong>
          <small>{payout.pendingCount > 0
            ? `${payout.pendingCount} ${payout.pendingCount === 1 ? "payout pendiente" : "payouts pendientes"}`
            : dashboard ? "Sin payouts pendientes" : periodLabel}</small>
        </article>
      </div>

      {hasCapabilities && (
        <div className="home-capability-grid">
          {capabilities?.managedDesk && (
            <article>
              <span>Mesa administrada</span>
              <strong>{capabilities.managedDesk.users} / {capabilities.managedDesk.capacity}</strong>
              <small>Facturación de la mesa</small>
              <b>{formatMoney(capabilities.managedDesk.billingInCents)}</b>
            </article>
          )}
          {capabilities?.referredDesks && (
            <article>
              <span>Mesas referidas</span>
              <strong>{capabilities.referredDesks.desks} / {capabilities.referredDesks.capacity}</strong>
              <small>Bonus vigente</small>
              <b>{capabilities.referredDesks.bonusBps / 100}%</b>
            </article>
          )}
          {capabilities?.identities && (
            <article>
              <span>Identidades activas</span>
              <strong>{capabilities.identities.active} / {capabilities.identities.capacity}</strong>
              <small>Payouts total identidades</small>
              <b>{formatMoney(capabilities.identities.payoutTotalInCents)}</b>
            </article>
          )}
        </div>
      )}

      <article className="home-capital-chart">
        <div className="home-chart-heading">
          <h2>{chartTitle}</h2>
          <div className="home-chart-actions">
            {dashboard && <div aria-label="Métrica del gráfico" className="home-chart-switch">
              <button aria-pressed={chartMetric === "earnings"} onClick={() => setChartMetric("earnings")} type="button">Ganancias</button>
              <button aria-pressed={chartMetric === "billing"} onClick={() => setChartMetric("billing")} type="button">Facturación</button>
            </div>}
            {chartHistory.length > 0 && <strong>{formatMoney(chartHistory.at(-1)!.valueInCents)}</strong>}
          </div>
        </div>

        {chartHistory.length > 0 ? (
          <svg viewBox="0 0 720 250" role="img" aria-label={`${chartTitle} mes a mes`}>
            <defs>
              <linearGradient id="home-capital-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line className="home-chart-axis" x1="18" x2="702" y1={chart.baseline} y2={chart.baseline} />
            <path className="home-chart-area" d={chart.area} />
            <path className="home-chart-line" d={chart.line} />
            {chart.points.map((point, index) => (
              <g key={point.periodMonth}>
                <circle cx={point.x} cy={point.y} r={index === chart.points.length - 1 ? 5 : 3.5} tabIndex={0}>
                  <title>{`${formatMonth(point.periodMonth)}: ${formatMoney(point.valueInCents)}`}</title>
                </circle>
                <text x={point.x} y="241" textAnchor="middle">{formatMonth(point.periodMonth)}</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="home-chart-empty">Sin historial disponible</div>
        )}
      </article>

      <div className="home-performance-grid">
        <article>
          <span>Mejor día</span>
          <strong>{formatMetric(performance.bestInCents)}</strong>
          <i className="positive" aria-hidden="true">↗</i>
        </article>
        <article>
          <span>Peor día</span>
          <strong>{formatMetric(performance.worstInCents)}</strong>
          <i className="negative" aria-hidden="true">↘</i>
        </article>
        <article>
          <span>Promedio diario</span>
          <strong>{formatMetric(performance.averageInCents)}</strong>
          <i aria-hidden="true">∿</i>
        </article>
      </div>
    </section>
  );
}
