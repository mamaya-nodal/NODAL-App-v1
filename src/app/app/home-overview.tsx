import {
  chooseHomeNextStep,
  type ProgressSummary,
} from "@/modules/summary/domain/progress-summary";

type HomeOverviewProps = Readonly<{
  modalityLabel: string;
  periodLabel: string;
  summary: ProgressSummary;
  userLabel: string;
}>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

function firstName(label: string) {
  return label.split(/\s|@/).filter(Boolean)[0] ?? "Trader";
}

export function HomeOverview({ modalityLabel, periodLabel, summary, userLabel }: HomeOverviewProps) {
  const nextStep = chooseHomeNextStep(summary);
  const isPositiveResult = summary.operatingResultInCents >= 0;

  return (
    <section aria-labelledby="home-overview-title" className="home-overview-panel" id="inicio">
      <div className="home-overview-heading workspace-view-heading">
        <div>
          <p className="status">TU ESPACIO OPERATIVO</p>
          <h2 id="home-overview-title">Buen día, {firstName(userLabel)}.</h2>
        </div>
      </div>

      <div className="home-dashboard-grid">
        <div className="home-primary-card">
          <span>Saldo broker</span>
          <strong>
            {summary.brokerBalanceInCents === null
              ? "Sin informar"
              : formatMoney(summary.brokerBalanceInCents)}
          </strong>
          <p className={isPositiveResult ? "positive-result" : "negative-result"}>
            {isPositiveResult ? "+ " : ""}
            {formatMoney(summary.operatingResultInCents)} resultado visible este período
          </p>
          <div className="home-card-chips">
            <span>{summary.accountStates.live} cuentas vivas</span>
            <span>{summary.accountStates.virgin} vírgenes</span>
          </div>
        </div>

        <aside className="home-next-step">
          <div className="home-card-heading"><h3>Próximo paso</h3><span>Hoy</span></div>
          <strong>{nextStep.title}</strong>
          <p>{nextStep.description}</p>
          <a href={nextStep.href}>{nextStep.label}</a>
        </aside>

        <article className="home-detail-card">
          <div className="home-card-heading"><h3>Cuentas operativas</h3><a href="#registro">Ver registro →</a></div>
          <dl>
            <div><dt>Vírgenes</dt><dd>{summary.accountStates.virgin}</dd></div>
            <div><dt>Vivas</dt><dd>{summary.accountStates.live}</dd></div>
            <div><dt>Cerradas</dt><dd>{summary.accountStates.closed}</dd></div>
          </dl>
        </article>

        <article className="home-detail-card">
          <div className="home-card-heading"><h3>Actividad del período</h3><span>{modalityLabel} · {periodLabel}</span></div>
          <dl>
            <div><dt>Controles confirmados</dt><dd>{summary.controlCount}</dd></div>
            <div><dt>Registros por cuenta</dt><dd>{summary.operationEntryCount}</dd></div>
            <div><dt>Último saldo</dt><dd>{summary.brokerBalanceUpdatedOn ?? "Sin informar"}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}
