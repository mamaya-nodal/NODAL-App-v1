import {
  chooseHomeNextStep,
  type ProgressSummary,
} from "@/modules/summary/domain/progress-summary";

type HomeOverviewProps = Readonly<{
  modalityLabel: string;
  periodLabel: string;
  summary: ProgressSummary;
}>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

export function HomeOverview({ modalityLabel, periodLabel, summary }: HomeOverviewProps) {
  const nextStep = chooseHomeNextStep(summary);
  const isPositiveResult = summary.operatingResultInCents >= 0;

  return (
    <section aria-labelledby="home-overview-title" className="home-overview-panel" id="inicio">
      <div className="home-overview-heading">
        <div>
          <p className="status">INICIO</p>
          <h2 id="home-overview-title">Tu situación actual</h2>
        </div>
        <span>{modalityLabel} · {periodLabel}</span>
      </div>

      <div className="home-overview-layout">
        <div className="home-primary-card">
          <span>Saldo broker</span>
          <strong>
            {summary.brokerBalanceInCents === null
              ? "Sin informar"
              : formatMoney(summary.brokerBalanceInCents)}
          </strong>
          <p className={isPositiveResult ? "positive-result" : "negative-result"}>
            {isPositiveResult ? "+ " : ""}
            {formatMoney(summary.operatingResultInCents)} resultado operativo
          </p>
        </div>
        <div className="home-snapshot" aria-label="Síntesis del período">
          <article>
            <span>Saldo broker</span>
            <strong>
              {summary.brokerBalanceInCents === null
                ? "Sin informar"
                : formatMoney(summary.brokerBalanceInCents)}
            </strong>
          </article>
          <article>
            <span>Resultado operativo</span>
            <strong>{formatMoney(summary.operatingResultInCents)}</strong>
          </article>
          <article>
            <span>Cuentas</span>
            <strong>{summary.accountCount}</strong>
          </article>
          <article>
            <span>Operatorias confirmadas</span>
            <strong>{summary.controlCount}</strong>
          </article>
        </div>

        <aside className="home-next-step">
          <span>SIGUIENTE PASO</span>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.description}</p>
          <a href={nextStep.href}>{nextStep.label}</a>
        </aside>
      </div>

      <p className="home-overview-note">
        Esta es una lectura rápida. El detalle y el origen de cada valor están en
        Compras, Control Diario, Registro y Resumen.
      </p>
    </section>
  );
}
