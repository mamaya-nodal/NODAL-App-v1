import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";
import {
  formatPeriodLabel,
  resolveWorkspaceSelection,
  type WorkspaceOption,
} from "@/modules/workspace/domain/selection";

type PrivateAppPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    period?: string | string[];
  }>;
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

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
  const { mode, period } = await searchParams;
  let workspaceOptions: WorkspaceOption[] = [];

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

  return (
    <main className="shell narrow-shell">
      <section className="hero" aria-labelledby="private-title">
        <p className="eyebrow">NODAL APP · ACCESO PRIVADO</p>
        <h1 id="private-title">
          {allowed ? "Acceso autorizado." : "Identidad verificada."}
        </h1>
        <p className="summary">
          {allowed
            ? "Tu usuario esta habilitado para ingresar al espacio NODAL."
            : "Google confirmo quien sos, pero este usuario todavia no tiene permiso para operar dentro de NODAL."}
        </p>
      </section>

      <section className="panel single-panel" aria-live="polite">
        <div>
          <p className="status">ESTADO DEL ACCESO</p>
          <h2>{allowed ? "Habilitado" : "Pendiente de autorizacion"}</h2>
        </div>
        <div>
          <p className="summary compact">
            Usuario identificado: {user.email ?? "correo no disponible"}
          </p>
          {!allowed && (
            <p className="notice">
              Este bloqueo es intencional: iniciar sesion con Google no concede
              acceso automatico a la informacion de NODAL.
            </p>
          )}
        </div>
      </section>

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

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero los espacios Real y Práctica todavía
          no fueron preparados.
        </p>
      )}

      <form action="/auth/logout" method="post">
        <button className="secondary-action" type="submit">
          Cerrar sesion
        </button>
      </form>
    </main>
  );
}
