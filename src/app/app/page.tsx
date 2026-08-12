import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";
import {
  formatPeriodLabel,
  resolveWorkspaceSelection,
  type WorkspaceOption,
} from "@/modules/workspace/domain/selection";

import { createPurchase } from "./purchase-actions";
import { DailyControlPreview } from "./daily-control-preview";

type PrivateAppPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    period?: string | string[];
    purchase_result?: string | string[];
  }>;
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function currentMonthInBuenosAires(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    style: "currency",
  }).format(cents / 100);
}

const purchaseMessages: Record<string, string> = {
  created: "Compra confirmada. La cuenta quedó creada como Cuenta virgen.",
  invalid_data: "Revisá la empresa, el precio y el origen de fondos.",
  not_created: "La compra no pudo confirmarse. No se guardó ningún dato.",
  period_not_current:
    "Ese período no admite una compra con fecha automática. La carga histórica sigue pendiente de definición.",
};

type PurchaseView = {
  companyCode: string;
  fundsOrigin: string;
  id: string;
  priceCents: number;
  purchaseNumber: number;
  purchasedOn: string;
  referenceNumber: number;
  state: string;
};

type AccountView = {
  companyId: string;
  id: string;
  referenceNumber: number;
};

export default async function PrivateAppPage({
  searchParams,
}: PrivateAppPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: nodalUser } = await supabase
    .from("nodal_users")
    .select("id, email, access_state")
    .eq("id", user.id)
    .maybeSingle();

  const decision = decideAccess(
    user.id,
    nodalUser
      ? { id: nodalUser.id, accessState: nodalUser.access_state }
      : null,
  );
  const allowed = decision === "allowed";
  const { mode, period, purchase_result: purchaseResult } = await searchParams;
  let workspaceOptions: WorkspaceOption[] = [];
  let companies: Array<{ code: string; displayName: string; id: string }> = [];

  if (allowed) {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, modality, periods(id, period_month)")
      .order("modality");

    workspaceOptions = (workspaces ?? []).map((workspace) => ({
      id: workspace.id,
      modality: workspace.modality,
      periods: workspace.periods.map((workspacePeriod) => ({
        id: workspacePeriod.id,
        periodMonth: workspacePeriod.period_month,
      })),
    }));
  }

  const selection = resolveWorkspaceSelection(
    workspaceOptions,
    singleValue(mode),
    singleValue(period),
  );
  let purchases: PurchaseView[] = [];
  let accountOptions: AccountView[] = [];

  if (allowed && selection?.period) {
    const [{ data: companyRows }, { data: accountRows }, { data: purchaseRows }] =
      await Promise.all([
        supabase
          .from("companies")
          .select("id, code, display_name")
          .eq("is_active", true)
          .order("code"),
        supabase
          .from("accounts")
          .select("id, company_id, reference_number, state")
          .eq("period_id", selection.period.id),
        supabase
          .from("purchases")
          .select(
            "id, account_id, purchase_number, purchased_on, price_cents, funds_origin",
          )
          .eq("period_id", selection.period.id)
          .order("purchase_number", { ascending: false }),
      ]);

    companies = (companyRows ?? []).map((company) => ({
      code: company.code,
      displayName: company.display_name,
      id: company.id,
    }));
    const accountsById = new Map(
      (accountRows ?? []).map((account) => [account.id, account]),
    );
    accountOptions = (accountRows ?? []).map((account) => ({
      companyId: account.company_id,
      id: account.id,
      referenceNumber: account.reference_number,
    }));
    const companiesById = new Map(
      (companyRows ?? []).map((company) => [company.id, company]),
    );

    purchases = (purchaseRows ?? []).flatMap((purchase) => {
      const account = accountsById.get(purchase.account_id);
      const company = account ? companiesById.get(account.company_id) : null;
      if (!account || !company) return [];

      return [
        {
          companyCode: company.code,
          fundsOrigin: purchase.funds_origin,
          id: purchase.id,
          priceCents: Number(purchase.price_cents),
          purchaseNumber: purchase.purchase_number,
          purchasedOn: purchase.purchased_on,
          referenceNumber: account.reference_number,
          state: account.state,
        },
      ];
    });
  }

  return (
    <main className="shell narrow-shell">
      <header className="app-header" aria-labelledby="private-title">
        <div className="app-brand-row">
          <a className="app-brand" href="#inicio" aria-label="Ir al inicio">
            NODAL <span>APP</span>
          </a>
          <span className="development-badge">Prototipo de desarrollo</span>
        </div>

        <div className="app-welcome" id="inicio">
          <div>
            <p className="eyebrow">ESPACIO PRIVADO DEL ALUMNO</p>
            <h1 id="private-title">
              {allowed ? "Panel operativo" : "Identidad verificada"}
            </h1>
            <p className="summary">
              {allowed
                ? "Compras, saldos y operatorias organizados en un solo lugar."
                : "Google confirmo quien sos, pero este usuario todavia no tiene permiso para operar dentro de NODAL."}
            </p>
          </div>
          <div className={`access-summary ${allowed ? "allowed" : "blocked"}`}>
            <span>{allowed ? "Acceso habilitado" : "Acceso pendiente"}</span>
            <small>
              {allowed ? "Identidad verificada con Google" : "Autorización NODAL requerida"}
            </small>
          </div>
        </div>

        {allowed && (
          <nav className="app-navigation" aria-label="Secciones de NODAL App">
            <a href="#inicio">Inicio</a>
            <a href="#compras">Compras</a>
            <a href="#control-diario">Control Diario</a>
            <span>Registro <small>Próximamente</small></span>
            <span>Resumen <small>Próximamente</small></span>
            <form action="/auth/logout" className="logout-form" method="post">
              <button type="submit">Cerrar sesión</button>
            </form>
          </nav>
        )}

        {!allowed && (
          <p className="notice">
            Este bloqueo es intencional: iniciar sesion con Google no concede
            acceso automatico a la informacion de NODAL.
          </p>
        )}
      </header>

      {allowed && selection && (
        <section className="context-panel" aria-labelledby="context-title">
          <div className="context-heading">
            <div>
              <p className="status">CONTEXTO DE TRABAJO</p>
              <h2 id="context-title">Modalidad y período</h2>
            </div>
            <p className="context-current" aria-live="polite">
              {selection.workspace.modality === "real" ? "Real" : "Práctica"}
              {selection.period
                ? ` · ${formatPeriodLabel(selection.period.periodMonth)}`
                : " · Sin período disponible"}
            </p>
          </div>

          <nav className="mode-tabs" aria-label="Seleccionar modalidad">
            {workspaceOptions.map((workspace) => {
              const latestPeriod = [...workspace.periods].sort((left, right) =>
                right.periodMonth.localeCompare(left.periodMonth),
              )[0];
              const selected = workspace.id === selection.workspace.id;
              const params = new URLSearchParams({ mode: workspace.modality });
              if (latestPeriod) params.set("period", latestPeriod.periodMonth);

              return (
                <a
                  aria-current={selected ? "page" : undefined}
                  className={`mode-tab${selected ? " selected" : ""}`}
                  href={`/app?${params.toString()}`}
                  key={workspace.id}
                >
                  {workspace.modality === "real" ? "Real" : "Práctica"}
                </a>
              );
            })}
          </nav>

          {selection.workspace.periods.length > 0 ? (
            <form className="period-form" action="/app" method="get">
              <input
                name="mode"
                type="hidden"
                value={selection.workspace.modality}
              />
              <label htmlFor="period">Período mensual</label>
              <div className="period-controls">
                <select
                  defaultValue={selection.period?.periodMonth}
                  id="period"
                  name="period"
                >
                  {selection.workspace.periods.map((workspacePeriod) => (
                    <option
                      key={workspacePeriod.id}
                      value={workspacePeriod.periodMonth}
                    >
                      {formatPeriodLabel(workspacePeriod.periodMonth)}
                    </option>
                  ))}
                </select>
                <button className="secondary-action inline-action" type="submit">
                  Cambiar período
                </button>
              </div>
            </form>
          ) : (
            <p className="notice">
              Este espacio todavía no tiene un período de desarrollo disponible.
            </p>
          )}

          <p className="context-note">
            Todos los registros futuros quedarán asociados a esta modalidad y a
            este período. Real y Práctica nunca se mezclarán.
          </p>
        </section>
      )}

      {allowed && selection?.period && (
        <section className="purchase-panel" id="compras" aria-labelledby="purchase-title">
          <div className="purchase-heading">
            <div>
              <p className="status">COMPRAS DEL PERÍODO</p>
              <h2 id="purchase-title">Nueva compra de cuenta</h2>
            </div>
            <p className="purchase-count">
              {purchases.length} {purchases.length === 1 ? "cuenta" : "cuentas"}
            </p>
          </div>

          {singleValue(purchaseResult) &&
            purchaseMessages[singleValue(purchaseResult) ?? ""] && (
              <p
                className={`purchase-message ${
                  singleValue(purchaseResult) === "created" ? "success" : "error"
                }`}
                role="status"
              >
                {purchaseMessages[singleValue(purchaseResult) ?? ""]}
              </p>
            )}

          {selection.period.periodMonth === currentMonthInBuenosAires() ? (
            <form action={createPurchase} className="purchase-form">
              <input name="mode" type="hidden" value={selection.workspace.modality} />
              <input name="period" type="hidden" value={selection.period.periodMonth} />
              <input name="period_id" type="hidden" value={selection.period.id} />

              <div className="form-field">
                <label htmlFor="company_id">Empresa</label>
                <select id="company_id" name="company_id" required defaultValue="">
                  <option disabled value="">
                    Elegí una empresa
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="price">Precio de compra (USD)</label>
                <input
                  id="price"
                  inputMode="decimal"
                  min="0"
                  name="price"
                  placeholder="Ejemplo: 89,00"
                  required
                  step="0.01"
                  type="number"
                />
              </div>

              <div className="form-field">
                <label htmlFor="funds_origin">Origen de fondos</label>
                <select id="funds_origin" name="funds_origin" required defaultValue="">
                  <option disabled value="">
                    Elegí el origen
                  </option>
                  <option value="Aporte trader">Aporte trader</option>
                  <option value="Saldo generado">Saldo generado</option>
                </select>
              </div>

              <div className="automatic-fields">
                <p>
                  <strong>Automático al confirmar:</strong> fecha de hoy, número
                  general, referencia propia de la empresa y estado Cuenta virgen.
                </p>
              </div>

              <button className="primary-action" type="submit">
                Confirmar compra
              </button>
            </form>
          ) : (
            <p className="notice">
              Este período es de consulta. La carga de una compra anterior se
              habilitará cuando Contabilidad defina su tratamiento exacto.
            </p>
          )}

          <div className="purchase-list" aria-label="Compras registradas">
            {purchases.length === 0 ? (
              <p className="empty-state">Todavía no hay compras en este período.</p>
            ) : (
              purchases.map((purchase) => (
                <article className="purchase-row" key={purchase.id}>
                  <div>
                    <p className="purchase-reference">
                      {purchase.companyCode} · Cuenta {purchase.referenceNumber}
                    </p>
                    <p className="purchase-meta">
                      Compra {purchase.purchaseNumber} · {purchase.purchasedOn} ·{" "}
                      {purchase.fundsOrigin}
                    </p>
                  </div>
                  <div className="purchase-values">
                    <strong>{formatMoney(purchase.priceCents)}</strong>
                    <span>
                      {purchase.state === "virgin" ? "Cuenta virgen" : purchase.state}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {allowed && selection?.period && (
        <DailyControlPreview
          accounts={accountOptions}
          companies={companies.map((company) => ({
            id: company.id,
            name: company.displayName,
          }))}
        />
      )}

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero los espacios Real y Práctica todavía
          no fueron preparados.
        </p>
      )}

    </main>
  );
}
