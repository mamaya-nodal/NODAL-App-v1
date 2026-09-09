import { notFound } from "next/navigation";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import { loadAdminNinjaTestSupervision } from "@/modules/ninja/server/admin-test-supervision";

import { AdminNinjaTestSupervisionPanel } from "./admin-ninja-test-supervision";

type Props = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ mode?: string | string[]; period?: string | string[] }>;
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

const money = (cents: number) => new Intl.NumberFormat("es-AR", {
  currency: "USD",
  style: "currency",
}).format(cents / 100);

const periodLabel = (period: string) => new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
}).format(new Date(`${period}T00:00:00Z`));

export default async function StudentAdminDetail({ params, searchParams }: Props) {
  const supabase = await requireNodalAdmin();
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const modality = one(query.mode) === "practice" ? "practice" : "real";
  const { data: student } = await supabase
    .from("nodal_users")
    .select("id,email,display_name,access_role")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: workspace }, ninjaSupervision] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id,periods(id,period_month)")
      .eq("owner_user_id", student.id)
      .eq("modality", modality)
      .maybeSingle(),
    loadAdminNinjaTestSupervision(supabase, student.id),
  ]);
  if (!ninjaSupervision) notFound();

  const selectedPeriod = workspace?.periods.find(
    (item) => item.period_month === one(query.period),
  ) ?? [...(workspace?.periods ?? [])].sort(
    (left, right) => right.period_month.localeCompare(left.period_month),
  )[0];
  const loaded = selectedPeriod
    ? (await loadPeriodSummaries(supabase, [selectedPeriod.id])).get(selectedPeriod.id)
    : null;
  const summary = loaded?.summary;

  return (
    <div className="admin-page admin-shell">
      <header className="workspace-view-heading admin-page-heading">
        <div><h2>{student.display_name || student.email}</h2></div>
        <p>{student.email}{selectedPeriod ? ` · ${periodLabel(selectedPeriod.period_month)}` : " · Sin período disponible"}</p>
      </header>

      {!summary ? (
        <section className="admin-empty-detail">
          <p>No hay registros contables para este período.</p>
        </section>
      ) : (
        <>
          <section className="admin-kpis admin-detail-kpis">
            <Metric label="Capital neto aportado" value={money(summary.capitalNetInCents)} />
            <Metric label="Ganancia bruta" value={money(summary.realizedGainInCents)} />
            <Metric label="Comisión de usuario" value={money(summary.commissionInCents)} />
          </section>
          <section className="admin-detail-grid">
            <Detail title="Cuentas">
              <Row label="Vírgenes" value={String(summary.accountStates.virgin)} />
              <Row label="Vivas" value={String(summary.accountStates.live)} />
              <Row label="Cerradas" value={String(summary.accountStates.closed)} />
              <Row label="Estados forzados" value={String(summary.manualAccountStateCount)} />
            </Detail>
            <Detail title="Resultado y posición">
              <Row label="Saldo broker" value={summary.brokerBalanceInCents === null ? "Sin saldo informado" : money(summary.brokerBalanceInCents)} />
              <Row label="Flotante" value={money(summary.floatingInCents)} />
              <Row label="Resultado del período" value={money(summary.periodResultInCents)} />
              <Row label="Ganancia trader estimada" value={money(summary.traderGainInCents)} />
            </Detail>
            <Detail title="Conciliaciones">
              <Row label="Diferencia de capital" value={money(summary.positionDifferenceInCents)} warn={summary.positionDifferenceInCents !== 0} />
              <Row label="Diferencia de ganancias" value={money(summary.realizedReconciliationDifferenceInCents)} warn={summary.realizedReconciliationDifferenceInCents !== 0} />
              <Row label="Retiros pendientes" value={money(summary.fundingPendingInCents)} />
              <Row label="Saldo billetera" value={money(summary.walletBalanceInCents)} />
            </Detail>
          </section>
        </>
      )}

      <AdminNinjaTestSupervisionPanel
        initialData={ninjaSupervision}
        userId={student.id}
      />
      <p className="admin-detail-note">
        Supervisión de solo lectura. La prueba no crea resultados contables.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article><span>{label}</span><strong>{value}</strong></article>;
}

function Detail({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="admin-detail-card"><h2>{title}</h2>{children}</article>;
}

function Row({ label, value, warn = false }: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return <p><span>{label}</span><strong className={warn ? "admin-value-warning" : ""}>{value}</strong></p>;
}
