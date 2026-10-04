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
import type { HomeDailyHistoryPoint } from "@/modules/summary/domain/home-dashboard";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import type { PeriodOpeningRecord } from "@/modules/summary/domain/opening-snapshot";
import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";
import { OpeningSetupPreview } from "./opening-setup-preview";
import { OpeningSnapshotHome } from "./opening-snapshot-panels";

type HomeOverviewProps = Readonly<{
  capitalHistory: CapitalHistoryPoint[];
  dashboard?: PersonalDashboardData;
  dailyHistory?: HomeDailyHistoryPoint[];
  liveBrokerBalance?: NinjaLiveBrokerBalance | null;
  openingSetupPreview?: boolean;
  openingSnapshot?: PeriodOpeningRecord | null;
  periodId?: string;
  performance: HomePerformance;
  periodLabel: string;
  summary: OperationalSummary;
}>;

type ChartMetric = "billing" | "earnings";
type ChartPoint = Readonly<{ label: string; valueInCents: number }>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
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

function formatDay(day: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${day.slice(0, 10)}T00:00:00Z`)).replace(".", "");
}

function chartGeometry(history: ChartPoint[]) {
  const width = 720;
  const height = 250;
  const left = 18;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const values = history.map((point) => point.valueInCents);
  const flatZero = values.length > 0 && values.every((value) => value === 0);
  const minimum = flatZero ? -1 : values.length ? Math.min(...values, 0) : 0;
  const maximum = flatZero ? 1 : values.length ? Math.max(...values, 0) : 1;
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number) => history.length <= 1
    ? width / 2
    : left + (index / (history.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((maximum - value) / span) * (height - top - bottom);
  const points = history.map((point, index) => ({ ...point, x: x(index), y: y(point.valueInCents) }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const baseline = y(0);
  const area = points.length
    ? `${line} L${points.at(-1)!.x.toFixed(1)} ${baseline} L${points[0].x.toFixed(1)} ${baseline} Z`
    : "";

  return { area, baseline, line, points };
}

function EarningsItem({ label, valueInCents }: Readonly<{ label: string; valueInCents: number }>) {
  return <div><span>{label}</span><strong>{formatMoney(valueInCents)}</strong></div>;
}

export function HomeOverview({ capitalHistory, dashboard, dailyHistory = [], liveBrokerBalance = null, openingSetupPreview = false, openingSnapshot = null, performance, periodId, periodLabel, summary }: HomeOverviewProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>(dashboard ? "earnings" : "billing");
  const [chartScale, setChartScale] = useState<"day" | "month">("month");
  const [liveBalance, setLiveBalance] = useState(liveBrokerBalance);
  const earnings = dashboard?.earnings ?? buildPeriodEarnings({ ownOperationsInCents: summary.traderGainInCents });
  const billingInCents = dashboard?.billingInCents ?? summary.realizedGainInCents;
  const payout = payoutDashboardSummary(summary.fundingWithdrawals);
  const history = dashboard?.history ?? [];
  const chartHistory = dashboard
    ? history.map((point) => ({
        label: formatMonth(point.periodMonth),
        valueInCents: chartMetric === "earnings" ? point.earningsInCents : point.billingInCents,
      }))
    : capitalHistory.map((point) => ({ label: formatMonth(point.periodMonth), valueInCents: point.capitalInCents }));
  const visibleChartHistory = chartScale === "day"
    ? dailyHistory.map((point) => ({ label: formatDay(point.operatedOn), valueInCents: point.resultInCents }))
    : chartHistory;
  const chart = chartGeometry(visibleChartHistory);
  const monthChartTitle = dashboard
    ? chartMetric === "earnings" ? "Ganancias por período" : "Facturación por período"
    : "Capital histórico acumulado";
  const chartTitle = chartScale === "day" ? "Resultado por día" : monthChartTitle;
  const capabilities = dashboard?.capabilities;
  const hasCapabilities = Boolean(capabilities?.managedDesk || capabilities?.identities);

  useEffect(() => {
    const receiveStatus = (event: Event) => {
      const detail = (event as CustomEvent<NinjaStatusEventDetail>).detail;
      setLiveBalance(detail.liveBrokerBalance);
    };
    window.addEventListener(NINJA_STATUS_EVENT, receiveStatus);
    return () => window.removeEventListener(NINJA_STATUS_EVENT, receiveStatus);
  }, []);

  return (
    <section aria-label="Inicio" className="home-overview-panel" id="inicio">
      {openingSetupPreview && periodId ? <OpeningSetupPreview autoOpen liveBrokerBalance={liveBalance} periodId={periodId} /> : null}
      {openingSnapshot ? <OpeningSnapshotHome opening={openingSnapshot} /> : null}
      {liveBalance && (
        <div className="home-live-status">
          <span>Saldo broker</span>
          <strong>{formatMoney(liveBalance.balanceInCents)}</strong>
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
            <div aria-label="Escala del gráfico" className="home-chart-switch">
              <button aria-pressed={chartScale === "month"} onClick={() => setChartScale("month")} type="button">Mes</button>
              <button aria-pressed={chartScale === "day"} onClick={() => setChartScale("day")} type="button">Día</button>
            </div>
            {dashboard && chartScale === "month" && <div aria-label="Métrica del gráfico" className="home-chart-switch">
              <button aria-pressed={chartMetric === "earnings"} onClick={() => setChartMetric("earnings")} type="button">Ganancias</button>
              <button aria-pressed={chartMetric === "billing"} onClick={() => setChartMetric("billing")} type="button">Facturación</button>
            </div>}
            {visibleChartHistory.length > 0 && <strong>{formatMoney(visibleChartHistory.at(-1)!.valueInCents)}</strong>}
          </div>
        </div>

        {visibleChartHistory.length > 0 ? (
          <svg viewBox="0 0 720 250" role="img" aria-label={chartTitle}>
            <defs>
              <linearGradient id="home-capital-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line className="home-chart-axis" x1="18" x2="702" y1={chart.baseline} y2={chart.baseline} />
          {chart.points.length === 1 ? (
            <rect
              className="home-chart-single-bar"
              height={Math.max(Math.abs(chart.baseline - chart.points[0].y), 3)}
              rx="6"
              width="36"
              x={chart.points[0].x - 18}
              y={Math.min(chart.baseline, chart.points[0].y) - (chart.baseline === chart.points[0].y ? 1.5 : 0)}
            />
          ) : <>
            <path className="home-chart-area" d={chart.area} />
            <path className="home-chart-line" d={chart.line} />
          </>}
            {chart.points.map((point, index) => (
              <g key={`${visibleChartHistory[index].label}-${index}`}>
                <circle cx={point.x} cy={point.y} r={index === chart.points.length - 1 ? 5 : 3.5} tabIndex={0}>
                  <title>{`${visibleChartHistory[index].label}: ${formatMoney(point.valueInCents)}`}</title>
                </circle>
                <text x={point.x} y="241" textAnchor="middle">{visibleChartHistory[index].label}</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="home-chart-empty">{chartScale === "day" ? "Sin resultados operativos en este período" : "Sin historial disponible"}</div>
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
