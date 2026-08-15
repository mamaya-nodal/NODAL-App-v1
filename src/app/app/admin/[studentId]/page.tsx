import Link from "next/link";
import { notFound } from "next/navigation";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";

type Props = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ mode?: string | string[]; period?: string | string[] }>;
};
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(cents / 100);
const periodLabel = (period: string) => new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${period}T00:00:00Z`));

export default async function StudentAdminDetail({ params, searchParams }: Props) {
  const supabase = await requireNodalAdmin();
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const modality = one(query.mode) === "practice" ? "practice" : "real";
  const { data: student } = await supabase.from("nodal_users").select("id, email, display_name, access_role").eq("id", studentId).eq("access_role", "student").maybeSingle();
  if (!student) notFound();
  const { data: workspace } = await supabase.from("workspaces").select("id, periods(id, period_month)").eq("owner_user_id", student.id).eq("modality", modality).maybeSingle();
  const selectedPeriod = workspace?.periods.find((item) => item.period_month === one(query.period)) ?? [...(workspace?.periods ?? [])].sort((a, b) => b.period_month.localeCompare(a.period_month))[0];
  const loaded = selectedPeriod ? (await loadPeriodSummaries(supabase, [selectedPeriod.id])).get(selectedPeriod.id) : null;
  const summary = loaded?.summary;
  return <main className="shell narrow-shell admin-shell">
    <header className="app-header admin-header"><div className="app-brand-row"><Link className="app-brand" href={`/app/admin?mode=${modality}&period=${selectedPeriod?.period_month ?? ""}`}>NODAL <span>APP</span></Link><span className="development-badge">Ficha de alumno · solo lectura</span></div><div className="app-welcome"><div><p className="eyebrow">DETALLE DEL ALUMNO</p><h1>{student.display_name || student.email}</h1><p className="summary">{student.email}{selectedPeriod ? ` · ${periodLabel(selectedPeriod.period_month)}` : " · Sin período disponible"}</p></div></div></header>
    {!summary ? <section className="admin-empty-detail"><p>No hay registros para revisar en esta modalidad y período.</p></section> : <><section className="admin-kpis admin-detail-kpis"><Metric label="Capital neto aportado" value={money(summary.capitalNetInCents)} /><Metric label="Ganancia realizada" value={money(summary.realizedGainInCents)} /><Metric label="Comisión NODAL estimada" value={money(summary.commissionInCents)} /></section><section className="admin-detail-grid"><Detail title="Cuentas"><Row label="Vírgenes" value={String(summary.accountStates.virgin)} /><Row label="Vivas" value={String(summary.accountStates.live)} /><Row label="Cerradas" value={String(summary.accountStates.closed)} /><Row label="Estados forzados" value={String(summary.manualAccountStateCount)} /></Detail><Detail title="Resultado y posición"><Row label="Saldo broker" value={summary.brokerBalanceInCents === null ? "Sin saldo informado" : money(summary.brokerBalanceInCents)} /><Row label="Flotante" value={money(summary.floatingInCents)} /><Row label="Resultado del período" value={money(summary.periodResultInCents)} /><Row label="Ganancia trader estimada" value={money(summary.traderGainInCents)} /></Detail><Detail title="Conciliaciones"><Row label="Diferencia de capital" value={money(summary.positionDifferenceInCents)} warn={summary.positionDifferenceInCents !== 0} /><Row label="Diferencia de ganancias" value={money(summary.realizedReconciliationDifferenceInCents)} warn={summary.realizedReconciliationDifferenceInCents !== 0} /><Row label="Retiros pendientes" value={money(summary.fundingPendingInCents)} /><Row label="Saldo billetera" value={money(summary.walletBalanceInCents)} /></Detail></section><p className="admin-detail-note">Esta ficha es de supervisión. Las correcciones siguen realizándose desde el flujo autorizado del alumno; este panel no modifica registros.</p></>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Detail({ children, title }: { children: React.ReactNode; title: string }) { return <article className="admin-detail-card"><h2>{title}</h2>{children}</article>; }
function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) { return <p><span>{label}</span><strong className={warn ? "admin-value-warning" : ""}>{value}</strong></p>; }
