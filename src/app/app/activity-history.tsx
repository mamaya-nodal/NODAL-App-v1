import type { PeriodActivityItem } from "@/modules/activity/domain/period-activity";

type ActivityHistoryProps = Readonly<{ embedded?: boolean; items: PeriodActivityItem[] }>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

function formatOperationalDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function ActivityHistory({ embedded = false, items }: ActivityHistoryProps) {
  return (
    <section
      aria-label={embedded ? "Historial contable" : undefined}
      aria-labelledby={embedded ? undefined : "activity-history-title"}
      className="activity-history-panel"
      id="actividad"
    >
      {!embedded && (
        <>
          <div className="activity-history-heading">
            <div>
              <p className="status">TRAZABILIDAD DEL PERÍODO</p>
              <h2 id="activity-history-title">Actividad registrada</h2>
            </div>
            <span className="activity-count">
              {items.length} {items.length === 1 ? "evento" : "eventos"}
            </span>
          </div>

          <p className="context-note">
            Acá podés reconstruir qué se confirmó y qué se corrigió. Las correcciones
            no duplican saldos ni resultados: los cálculos usan solamente el valor
            vigente.
          </p>
        </>
      )}

      {items.length === 0 ? (
        <p className="empty-state activity-empty">
          Todavía no hay actividad registrada en este período.
        </p>
      ) : (
        <ol className="activity-list">
          {items.map((item) => (
            <li className="activity-item" key={item.id}>
              <span
                aria-hidden="true"
                className={`activity-marker${item.correction ? " correction" : ""}`}
              />
              <article>
                <div className="activity-item-heading">
                  <div>
                    <span className="activity-reference">{item.reference}</span>
                    {item.correction && (
                      <span className="correction-badge">Corrección</span>
                    )}
                    <h3>{item.title}</h3>
                  </div>
                  <time dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                </div>
                <p className="activity-subtitle">{item.subtitle}</p>
                <div className="activity-details">
                  {item.operatedOn && (
                    <span>Fecha operativa: {formatOperationalDate(item.operatedOn)}</span>
                  )}
                  {item.amountInCents !== null && (
                    <strong>{formatMoney(item.amountInCents)}</strong>
                  )}
                  {item.balanceAfterInCents !== null && (
                    <span>Saldo posterior: {formatMoney(item.balanceAfterInCents)}</span>
                  )}
                </div>
                {item.reason && (
                  <p className="activity-reason">
                    <strong>Motivo:</strong> {item.reason}
                  </p>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
