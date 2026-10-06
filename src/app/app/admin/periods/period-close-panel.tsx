"use client";

import { useActionState } from "react";

import type { PeriodCloseControlData } from "@/modules/accounting/server/load-period-close-control";
import { canApprovePeriodClosure } from "@/modules/accounting/domain/period-close-approval";
import {
  approveAccountingClosure,
  rectifyAccountingClosure,
  resolveAccountingClosureObservation,
  retryAccountingClosures,
  type ClosureActionResult,
} from "./actions";
import "../desks.css";
import "./periods.css";

const initial: ClosureActionResult = { message: "", ok: false };
const money = (value: number) => new Intl.NumberFormat("es-AR", {
  currency: "USD", maximumFractionDigits: 2, style: "currency",
}).format(value / 100);
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-AR", {
      dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value))
  : "—";
const month = (value: string) => new Intl.DateTimeFormat("es-AR", {
  month: "long", timeZone: "UTC", year: "numeric",
}).format(new Date(`${value}T00:00:00Z`));

function ActionMessage({ result }: Readonly<{ result: ClosureActionResult }>) {
  return result.message ? <p className={result.ok ? "close-action-success" : "close-action-error"} role="status">{result.message}</p> : null;
}

function RetryControl() {
  const [result, action, pending] = useActionState(retryAccountingClosures, initial);
  return <form action={action} className="close-retry-form">
    <button className="primary-action" disabled={pending}>{pending ? "Revisando…" : "Reintentar cierres"}</button>
    <ActionMessage result={result} />
  </form>;
}

function ResolutionForm({ periodId }: Readonly<{ periodId: string }>) {
  const [result, action, pending] = useActionState(resolveAccountingClosureObservation, initial);
  return <form action={action} className="close-action-form">
    <input name="period_id" type="hidden" value={periodId} />
    <label>Explicación<input name="resolution" required /></label>
    <label>Evidencia<input name="evidence" placeholder="Referencia, comprobación o enlace interno" required /></label>
    <button className="secondary-action" disabled={pending}>{pending ? "Guardando…" : "Resolver observación"}</button>
    <ActionMessage result={result} />
  </form>;
}

function RectificationForm({ periodId }: Readonly<{ periodId: string }>) {
  const [result, action, pending] = useActionState(rectifyAccountingClosure, initial);
  return <form action={action} className="close-action-form close-rectification-form">
    <input name="period_id" type="hidden" value={periodId} />
    <label>Ajuste de resultado (USD)<input defaultValue="0" inputMode="decimal" name="result_adjustment" required /></label>
    <label>Ajuste de comisión (USD)<input defaultValue="0" inputMode="decimal" name="commission_adjustment" required /></label>
    <label>Motivo<input name="reason" required /></label>
    <label>Evidencia<input name="evidence" placeholder="Referencia, comprobación o enlace interno" required /></label>
    <button className="secondary-action" disabled={pending}>{pending ? "Rectificando…" : "Rectificar cierre"}</button>
    <ActionMessage result={result} />
  </form>;
}

function ApprovalForm({ periodId }: Readonly<{ periodId: string }>) {
  const [result, action, pending] = useActionState(approveAccountingClosure, initial);
  return <form action={action} className="close-approval-form">
    <input name="period_id" type="hidden" value={periodId} />
    <label><input name="approval_confirmed" required type="checkbox" /> Revisé el cierre y apruebo esta versión</label>
    <button className="primary-action" disabled={pending}>{pending ? "Aprobando…" : "Aprobar cierre"}</button>
    <ActionMessage result={result} />
  </form>;
}

export function PeriodClosePanel({ data, embedded = false }: Readonly<{ data: PeriodCloseControlData; embedded?: boolean }>) {
  const lastRun = data.runs[0];
  return <div className={`${embedded ? "close-control-embedded" : "admin-page admin-shell"} close-control-page`}>
    <header className="desk-heading"><div>{!embedded ? <p className="status">ADMIN MASTER</p> : null}<h1>{embedded ? "Administración de cierres" : "Cierres contables"}</h1></div><RetryControl /></header>

    <section className="close-overview-grid">
      <article><span>Última ejecución</span><strong>{lastRun ? dateTime(lastRun.startedAt) : "Sin ejecuciones"}</strong><small>{lastRun ? lastRun.triggerSource === "manual" ? "Manual" : "Automática" : ""}</small></article>
      <article><span>Estado</span><strong>{lastRun?.status === "succeeded" ? "Correcto" : lastRun?.status === "partial" ? "Parcial" : lastRun?.status === "failed" ? "Falló" : lastRun?.status === "running" ? "En curso" : "—"}</strong><small>{lastRun ? `${lastRun.closedPeriodCount} de ${lastRun.duePeriodCount} vencidos cerrados` : ""}</small></article>
      <article><span>Períodos abiertos</span><strong>{data.openPeriods.length}</strong><small>Real y Práctica</small></article>
      <article><span>Cierres observados</span><strong>{data.closedPeriods.filter((period) => period.closureStatus === "closed_with_observations" && !period.resolution).length}</strong><small>Pendientes de explicación o rectificación</small></article>
      <article><span>Pendientes de aprobación</span><strong>{data.closedPeriods.filter((period) => !period.approval).length}</strong><small>Requieren revisión de Admin Master</small></article>
    </section>

    <section className="desk-surface">
      <h2>Próximos cierres</h2>
      <div className="close-period-list compact">
        {data.openPeriods.map((period) => <article key={period.periodId}>
          <div><strong>{period.owner}</strong><span>{period.modality === "practice" ? "Práctica" : "Real"} · {month(period.month)}</span></div>
          <time>{dateTime(period.scheduledCloseAt)}</time>
        </article>)}
      </div>
    </section>

    <section className="desk-surface">
      <h2>Períodos cerrados</h2>
      <div className="close-period-list">
        {data.closedPeriods.map((period) => {
          const observed = period.closureStatus === "closed_with_observations";
          const resolved = Boolean(period.resolution);
          const approved = Boolean(period.approval);
          const reportReady = period.report?.report_status === "ready";
          const canApprove = reportReady && canApprovePeriodClosure({
            approved,
            hasResolvedObservation: resolved,
            status: period.closureStatus,
          });
          return <details className="close-period-card" key={period.periodId}>
            <summary>
              <div><strong>{period.owner}</strong><span>{period.modality === "practice" ? "Práctica" : "Real"} · {month(period.month)} · versión {period.version}</span></div>
              <span className={`close-status ${approved ? "approved" : period.closureStatus}`}>{approved ? "Aprobado" : period.closureStatus === "rectified" ? "Rectificado · pendiente" : observed ? resolved ? "Observación resuelta · pendiente" : "Con observaciones" : "Pendiente de aprobación"}</span>
              <time>{dateTime(period.closedAt)}</time>
            </summary>
            <div className="close-period-body">
              <dl className="close-metrics">
                <div><dt>Resultado realizado</dt><dd>{money(period.realizedGainInCents)}</dd></div>
                <div><dt>Comisión</dt><dd>{money(period.commissionInCents)}</dd></div>
                <div><dt>Resultado usuario</dt><dd>{money(period.traderResultInCents)}</dd></div>
                <div><dt>Diferencia capital</dt><dd>{money(period.positionDifferenceInCents)}</dd></div>
                <div><dt>Diferencia ganancias</dt><dd>{money(period.realizedDifferenceInCents)}</dd></div>
              </dl>
              <div className="close-report-review">
                <div><strong>Informe PDF</strong><p>Fotografía inmutable de esta versión del cierre, con operaciones, identidades y mesa.</p></div>
                {reportReady
                  ? <a className="secondary-action close-report-link" href={`/api/admin/period-reports/${period.closureId}`} rel="noreferrer" target="_blank">Revisar informe PDF</a>
                  : <span>{period.report?.report_status === "failed" ? `Falló: ${period.report.failure_message ?? "sin detalle"}` : "Generación pendiente"}</span>}
              </div>
              {period.resolution && <div className="close-resolution"><strong>Resolución registrada</strong><p>{period.resolution.resolution}</p><small>{period.resolution.evidence} · {dateTime(period.resolution.resolved_at)}</small></div>}
              {observed && !resolved && <details className="close-inner-action"><summary>Resolver sin cambiar importes</summary><ResolutionForm periodId={period.periodId} /></details>}
              <details className="close-inner-action"><summary>Rectificar importes del cierre</summary><RectificationForm periodId={period.periodId} /></details>
              {canApprove && <ApprovalForm periodId={period.periodId} />}
              {!approved && !reportReady && <p className="close-report-gate">La aprobación se habilitará cuando el PDF esté listo para revisar.</p>}
              {approved && period.dispatch && <div className="close-dispatch-state"><strong>Correo de cierre</strong><span>{period.dispatch.delivery_status === "awaiting_documents" ? "Esperando informe PDF y factura" : period.dispatch.delivery_status}</span><small>Para {period.dispatch.recipient_email} · desde {period.dispatch.sender_email}</small><small>Asunto: {period.dispatch.subject}</small></div>}
            </div>
          </details>;
        })}
      </div>
    </section>

    <section className="desk-surface">
      <h2>Ejecuciones recientes</h2>
      <div className="close-run-list">
        {data.runs.map((run) => <article key={run.id}><strong>{run.status === "succeeded" ? "Correcta" : run.status === "partial" ? "Parcial" : run.status === "failed" ? "Falló" : "En curso"}</strong><span>{run.triggerSource === "manual" ? "Manual" : "Automática"}</span><time>{dateTime(run.startedAt)}</time><small>{run.closedPeriodCount}/{run.duePeriodCount} períodos</small></article>)}
      </div>
    </section>
  </div>;
}

