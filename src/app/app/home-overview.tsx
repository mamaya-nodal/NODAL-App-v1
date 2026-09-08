import type {
  CapitalHistoryPoint,
  HomePerformance,
} from "@/modules/summary/domain/home-dashboard";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

type HomeOverviewProps = Readonly<{
  capitalHistory: CapitalHistoryPoint[];
  performance: HomePerformance;
  periodLabel: string;
  summary: OperationalSummary;
}>;

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

function chartGeometry(history: CapitalHistoryPoint[]) {
  const width = 720;
  const height = 250;
  const left = 18;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const values = history.map((point) => point.capitalInCents);
  const minimum = values.length ? Math.min(...values, 0) : 0;
  const maximum = values.length ? Math.max(...values, 0) : 1;
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number) => history.length <= 1
    ? width / 2
    : left + (index / (history.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((maximum - value) / span) * (height - top - bottom);
  const points = history.map((point, index) => ({ ...point, x: x(index), y: y(point.capitalInCents) }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const baseline = height - bottom;
  const area = points.length
    ? `${line} L${points.at(-1)!.x.toFixed(1)} ${baseline} L${points[0].x.toFixed(1)} ${baseline} Z`
    : "";

  return { area, baseline, line, points };
}

export function HomeOverview({ capitalHistory, performance, periodLabel, summary }: HomeOverviewProps) {
  const chart = chartGeometry(capitalHistory);
  const payoutCount = summary.fundingWithdrawals.length;

  return (
    <section aria-label="Inicio" className="home-overview-panel" id="inicio">
      <div className="home-financial-grid">
        <article className="home-net-result">
          <span>Resultado neto</span>
          <strong className={summary.realizedGainInCents < 0 ? "negative" : undefined}>
            {formatMoney(summary.realizedGainInCents)}
          </strong>
          <small>{periodLabel}</small>
        </article>

        <article className="home-financial-metric">
          <span>Capital neto total</span>
          <strong>{formatMoney(summary.capitalNetInCents)}</strong>
          <small>{periodLabel}</small>
        </article>

        <article className="home-financial-metric">
          <span>Payouts</span>
          <strong>{payoutCount}</strong>
          <small>{summary.fundingPendingInCents > 0 ? "Con cobros pendientes" : periodLabel}</small>
        </article>
      </div>

      <article className="home-capital-chart">
        <div className="home-chart-heading">
          <h2>Capital histórico acumulado</h2>
          {capitalHistory.length > 0 && <strong>{formatMoney(capitalHistory.at(-1)!.capitalInCents)}</strong>}
        </div>

        {capitalHistory.length > 0 ? (
          <svg viewBox="0 0 720 250" role="img" aria-label="Capital neto acumulado mes a mes">
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
                <circle cx={point.x} cy={point.y} r={index === chart.points.length - 1 ? 5 : 3.5} />
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
