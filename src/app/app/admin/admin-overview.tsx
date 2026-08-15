import Link from "next/link";

import type { AdminStudentOverview } from "@/modules/admin/domain/admin-overview";

type Props = Readonly<{
  modality: "practice" | "real";
  period: string;
  periods: string[];
  students: readonly AdminStudentOverview[];
}>;

const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(cents / 100);
const periodLabel = (period: string) => period ? new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${period}T00:00:00Z`)) : "Sin período";

export function AdminOverview({ modality, period, periods, students }: Props) {
  const activeRecently = students.filter((student) => student.activityState === "active_today" || student.activityState === "recent").length;
  const winning = students.filter((student) => student.performanceState === "winning").length;
  const commission = students.reduce((total, student) => total + student.commissionInCents, 0);
  return <main className="shell narrow-shell admin-shell">
    <header className="app-header admin-header">
      <div className="app-brand-row"><Link className="app-brand" href="/app">NODAL <span>APP</span></Link><span className="development-badge">Administración</span></div>
      <div className="app-welcome"><div><p className="eyebrow">PANEL DE ADMINISTRACIÓN</p><h1>Vista general</h1><p className="summary">Una señal simple por alumno. Entrá a su ficha solo cuando necesites revisar el detalle.</p></div><Link className="admin-manage-link" href="/app/admin/users">Gestionar accesos</Link></div>
    </header>
    <section className="admin-context" aria-label="Período del panel">
      <form action="/app/admin" method="get"><label htmlFor="mode">Modalidad</label><select defaultValue={modality} id="mode" name="mode"><option value="real">Real</option><option value="practice">Práctica</option></select><label htmlFor="period">Período</label><select defaultValue={period} id="period" name="period">{periods.map((value) => <option key={value} value={value}>{periodLabel(value)}</option>)}</select><button className="secondary-action" type="submit">Ver período</button></form>
      <p>Los importes se calculan desde los registros existentes. La comisión sigue siendo estimada durante el mes.</p>
    </section>
    <section className="admin-kpis" aria-label="Resumen general"><Metric label="Alumnos activos recientemente" value={`${activeRecently} de ${students.length}`} /><Metric label="Alumnos con ganancia realizada" value={String(winning)} /><Metric label="Comisión NODAL estimada" value={money(commission)} /></section>
    <section className="admin-student-list" aria-labelledby="admin-students-title">
      <div className="summary-heading"><div><p className="status">SEGUIMIENTO DEL PERÍODO</p><h2 id="admin-students-title">Alumnos</h2></div><span className="calculated-badge">{periodLabel(period)}</span></div>
      {students.length === 0 ? <p className="empty-state">No hay alumnos autorizados con espacio en esta modalidad.</p> : <div className="admin-student-table">{students.map((student) => <article className="admin-student-row" key={student.id}><div className="admin-student-name"><strong>{student.name}</strong><span>{student.email}</span></div><Signal label="Actividad" state={student.activityState} value={student.activityLabel} /><Signal label="Resultado realizado" state={student.performanceState} value={student.performanceLabel} /><div className="admin-money"><span>Capital neto</span><strong>{money(student.capitalInCents)}</strong><small>{student.summary.accountStates.live} cuentas vivas</small></div><div className="admin-money"><span>Comisión NODAL</span><strong>{money(student.commissionInCents)}</strong><small>{student.summary.commissionRateLabel}</small></div><Link className="admin-detail-link" href={`/app/admin/${student.id}?mode=${modality}&period=${period}`}>Ver ficha</Link></article>)}</div>}
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Signal({ label, state, value }: { label: string; state: string; value: string }) { return <div className="admin-signal"><span>{label}</span><strong className={`admin-state ${state}`}>{value}</strong></div>; }
