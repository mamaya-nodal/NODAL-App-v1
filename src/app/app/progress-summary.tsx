import type { ProgressSummary as ProgressSummaryData } from "@/modules/summary/domain/progress-summary";

type ProgressSummaryProps = Readonly<{ summary: ProgressSummaryData }>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function ProgressSummary({ summary }: ProgressSummaryProps) {
  return (
    <section aria-labelledby="progress-summary-title" className="progress-summary-panel" id="resumen">
      <div className="summary-heading">
        <div>
          <p className="status">RESUMEN DEL PERÍODO</p>
          <h2 id="progress-summary-title">Progreso disponible</h2>
        </div>
        <span className="calculated-badge">Calculado automáticamente</span>
      </div>

      <p className="context-note">
        Esta primera versión reúne solamente valores que la app ya puede explicar
        desde Compras, Control Diario y Registro de Operaciones.
      </p>

      <div className="progress-primary-grid">
        <article className="progress-card featured">
          <span>Saldo broker actual</span>
          <strong>{summary.brokerBalanceInCents === null ? "Sin saldo informado" : formatMoney(summary.brokerBalanceInCents)}</strong>
          <small>{summary.brokerBalanceUpdatedOn ? `Actualizado el ${formatDate(summary.brokerBalanceUpdatedOn)}` : "Se establecerá con el primer depósito"}</small>
          <a href="#control-diario">Ver Control Diario</a>
        </article>

        <article className="progress-card">
          <span>Resultado operativo registrado</span>
          <strong>{formatMoney(summary.operatingResultInCents)}</strong>
          <small>Resultado de los nuevos saldos confirmados</small>
          <a href="#registro">Ver registros por cuenta</a>
        </article>

        <article className="progress-card">
          <span>Cuentas del período</span>
          <strong>{summary.accountCount}</strong>
          <small>{formatMoney(summary.purchaseCostInCents)} en compras registradas</small>
          <a href="#compras">Ver compras</a>
        </article>

        <article className="progress-card">
          <span>Actividad confirmada</span>
          <strong>{summary.controlCount}</strong>
          <small>{summary.operationEntryCount} entradas automáticas por cuenta</small>
          <a href="#actividad">Ver actividad completa</a>
        </article>
      </div>

      <div className="progress-detail-grid">
        <article className="progress-detail">
          <h3>Movimientos de Control Diario</h3>
          <dl>
            <div><dt>Depósitos informados</dt><dd>{formatMoney(summary.depositsInCents)}</dd></div>
            <div><dt>Retiros informados</dt><dd>{formatMoney(summary.withdrawalsInCents)}</dd></div>
          </dl>
          <p>Estos movimientos no se presentan como ganancia o pérdida.</p>
        </article>

        <article className="progress-detail">
          <h3>Estado operativo de cuentas</h3>
          <dl>
            <div><dt>Vírgenes</dt><dd>{summary.accountStates.virgin}</dd></div>
            <div><dt>Vivas</dt><dd>{summary.accountStates.live}</dd></div>
            <div><dt>Cerradas</dt><dd>{summary.accountStates.closed}</dd></div>
          </dl>
          <p>Los cambios automáticos de estado todavía no están habilitados.</p>
        </article>
      </div>

      <aside className="summary-scope-warning">
        <strong>Alcance actual</strong>
        <p>
          Aún no se muestran TOTAL GANANCIA, billetera, retiros de fondeo,
          comisiones ni conciliaciones. Esos valores se incorporarán cuando sus
          fórmulas y casos de equivalencia estén validados; no se estiman ni se
          reemplazan por cifras incompletas.
        </p>
      </aside>
    </section>
  );
}
