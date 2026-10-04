"use client";
import Link from "next/link";
import { useActionState, useState, useEffect, useRef } from "react";
import type { DeskPanelData } from "@/modules/admin/server/load-desks";
import {
  ROOT_DESK,
  ECONOMIC_LABELS as labels,
} from "@/modules/admin/domain/desks";
import { saveDesk, saveUserTerms } from "./desk-actions";
import "./desks.css";
type Row = DeskPanelData["overview"]["desks"][number];
type Person = DeskPanelData["overview"]["people"][number];
const money = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v / 100);
const monthLabel = (v: string) =>
  new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(v + "T00:00:00Z"));
const initial = { ok: false, message: "" };

export function DeskPanel({ data }: { data: DeskPanelData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [person, setPerson] = useState<string | null>(null);
  const [editingDesk, setEditingDesk] = useState<string | null>(null);
  const rows = data.overview.desks;
  const root = rows.find((d) => d.id === ROOT_DESK);
  const desk = rows.find((d) => d.id === selected);
  const members = data.overview.people.filter(
    (p) => !desk || p.deskId === desk.id,
  );
  const manager = data.overview.people.find(
    (p) => p.id === desk?.terms.manager_id,
  );
  const toggle = (id: string) =>
    setExpanded((prior) => {
      const next = new Set(prior);
      if (id === ROOT_DESK) {
        if (next.has(id)) next.clear();
        else
          rows
            .filter((r) => r.children.length > 0)
            .forEach((r) => next.add(r.id));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function card(
    row: Row,
    number: string,
    depth = 0,
    ancestors: string[] = [],
  ): React.ReactNode {
    if (ancestors.includes(row.id)) return null;
    const children = rows.filter(
      (d) => d.parent_id === row.id && d.terms.active,
    );
    const owner = data.overview.people.find(
      (p) => p.id === row.terms.manager_id,
    );
    return (
      <div className="desk-branch" key={row.id}>
        <article className="desk-card">
          <button
            type="button"
            className="desk-open"
            onClick={() => setSelected(row.id)}
            aria-label={`Abrir ${row.name}`}
          >
            <h3>
              {number} · {row.name}
            </h3>
            <span className="desk-manager">
              {owner?.name ?? "Admin Master"}
            </span>
            <div className="desk-metrics">
              <Metric label={labels.commission} value={money(row.generated)} />
              <Metric
                label="Acuerdo mesa"
                value={`${row.terms.nodal_bps / 100}%`}
              />
              <Metric label="Usuarios" value={String(row.members.length)} />
              <Metric label="Mesas dep." value={String(children.length)} />
            </div>
            {owner && (
              <div className="desk-income">
                <span>{labels.total}</span>
                <strong>{money(owner.totalIncome)}</strong>
              </div>
            )}
          </button>
          {children.length > 0 && (
            <button
              className="secondary-action desk-expand"
              type="button"
              aria-expanded={expanded.has(row.id)}
              aria-controls={`branch-${row.id}`}
              onClick={() => toggle(row.id)}
            >
              {expanded.has(row.id) ? "Ocultar" : "Ver"}
            </button>
          )}
        </article>
        {row.id !== ROOT_DESK &&
          expanded.has(row.id) &&
          children.length > 0 && (
            <div
              id={`branch-${row.id}`}
              className={`desk-children ${depth > 1 ? "desk-children-deep" : ""}`}
            >
              {children.map((child, i) =>
                card(child, `${number}.${i + 1}`, depth + 1, [
                  ...ancestors,
                  row.id,
                ]),
              )}
            </div>
          )}
      </div>
    );
  }
  return (
    <div className="admin-page admin-shell desk-admin">
      <header className="desk-heading">
        <h1>{desk?.name ?? "Vista general"}</h1>
        <div>
          {desk && (
            <button
              className="secondary-action"
              onClick={() => setSelected(null)}
            >
              Volver
            </button>
          )}
          <button
            className="primary-action"
            disabled={!data.ready || data.month !== data.currentMonth}
            onClick={() =>
              setEditingDesk(desk && desk.id !== ROOT_DESK ? desk.id : "new")
            }
          >
            {desk && desk.id !== ROOT_DESK ? "Gestionar mesa" : "Nueva mesa"}
          </button>
        </div>
      </header>
      <form className="desk-period" method="get" action="/app/admin">
        <select aria-label="Modalidad" name="mode" defaultValue={data.mode}>
          <option value="real">Real</option>
          <option value="practice">Práctica</option>
        </select>
        <select aria-label="Período" name="period" defaultValue={data.month}>
          {data.periods.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <button className="secondary-action">Aplicar</button>
      </form>
      {!data.ready && (
        <p role="status">
          La gestión de mesas estará disponible al completar la actualización de
          la base.
        </p>
      )}
      {!desk ? (
        <>
          <div className="desk-top">
            <section className="desk-total">
              <div className="desk-metrics">
                <Metric
                  label="Total mesas"
                  value={String(rows.filter((r) => r.terms.active).length)}
                />
                <Metric
                  label="Total usuarios"
                  value={String(data.overview.people.length)}
                />
                <Metric
                  label={labels.gross}
                  value={money(data.overview.gross)}
                />
                <Metric
                  label="Com. PA NODAL"
                  value={money(data.overview.nodalIncome)}
                />
              </div>
            </section>
            {root && card(root, "0")}
          </div>
          {
            <section
              className="desk-tree-scroll"
              id={`branch-${ROOT_DESK}`}
              aria-label="Mesas"
            >
              <div className="desk-tree-grid">
                {rows
                  .filter((r) => r.parent_id === ROOT_DESK && r.terms.active)
                  .map((r, i) => card(r, String(i + 1)))}
              </div>
              {rows.filter((r) => r.parent_id === ROOT_DESK).length === 0 && (
                <p className="desk-empty">Todavía no hay mesas derivadas.</p>
              )}
            </section>
          }
          <DeskChart data={data} />
        </>
      ) : (
        <>
          <section className="desk-kpis">
            <Metric label="Usuarios" value={String(members.length)} />
            <Metric label={labels.gross} value={money(desk.gross)} />
            <Metric label="Comisión generada" value={money(desk.generated)} />
            <Metric
              label="Mesas derivadas"
              value={String(desk.children.length)}
            />
          </section>
          <section className="desk-surface">
            <h2>Usuarios</h2>
            <UserTable people={members} data={data} onPerson={setPerson} />
          </section>
          {manager && (
            <section className="desk-surface">
              <h2>Ingreso de {manager.name}</h2>
              <div className="desk-kpis">
                <Metric
                  label="Operativa propia"
                  value={money(manager.ownIncome)}
                />
                <Metric
                  label="Participación de mesa"
                  value={money(manager.mesaIncome)}
                />
              </div>
            </section>
          )}
          <section className="desk-surface">
            <h2>Mesas derivadas</h2>
            <div className="desk-tree-scroll">
              <div className="desk-tree-grid">
                {rows
                  .filter((r) => r.parent_id === desk.id)
                  .map((r, i) => card(r, String(i + 1)))}
              </div>
              {desk.children.length === 0 && (
                <p className="desk-empty">Sin mesas derivadas.</p>
              )}
            </div>
          </section>
        </>
      )}
      {!desk && (
        <section className="desk-surface">
          <h2>Usuarios</h2>
          <UserTable people={members} data={data} onPerson={setPerson} />
        </section>
      )}
      {person && (
        <UserEditor
          key={person}
          person={data.overview.people.find((p) => p.id === person)!}
          data={data}
          close={() => setPerson(null)}
        />
      )}
      {editingDesk && (
        <DeskEditor
          key={editingDesk}
          desk={rows.find((r) => r.id === editingDesk)}
          data={data}
          close={() => setEditingDesk(null)}
        />
      )}
    </div>
  );
}
function ManagementDialog({
  label,
  close,
  children,
}: {
  label: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="desk-dialog"
      aria-label={label}
      onCancel={close}
    >
      {children}
    </dialog>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function UserTable({
  people,
  data,
  onPerson,
}: {
  people: Person[];
  data: DeskPanelData;
  onPerson: (id: string) => void;
}) {
  return (
    <div className="desk-table-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nivel</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acuerdo</th>
            <th>{labels.commission}</th>
            <th>{labels.historic}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="desk-person" onClick={() => onPerson(p.id)}>
                  {p.name}
                </button>
              </td>
              <td>{p.terms?.level ?? 1}</td>
              <td>
                {p.master
                  ? "Master"
                  : data.overview.desks.some(
                        (d) => d.terms.manager_id === p.id && d.terms.active,
                      )
                    ? "Admin de mesa"
                    : "Usuario"}
              </td>
              <td>
                {p.access !== "active"
                  ? "Sin acceso"
                  : p.terms?.state === "paused"
                    ? "Pausa"
                    : p.terms?.state === "inactive"
                      ? "Baja"
                      : "Activo"}
              </td>
              <td>
                {p.terms ? `${p.terms.commission_bps / 100}%` : "Configurar"}
              </td>
              <td>{money(p.commission)}</td>
              <td>{money(data.historicCommission[p.id] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!people.length && <p className="desk-empty">Sin usuarios asignados.</p>}
    </div>
  );
}
function MonthInput({ month }: { month: string }) {
  return <input type="hidden" name="month" value={month} />;
}
function UserEditor({
  person: p,
  data,
  close,
}: {
  person: Person;
  data: DeskPanelData;
  close: () => void;
}) {
  const [result, action, pending] = useActionState(saveUserTerms, initial);
  const records = data.history.filter((h) => h.userId === p.id);
  return (
    <ManagementDialog label={`Gestionar ${p.name}`} close={close}>
      <header>
        <h2>{p.name}</h2>
        <button className="secondary-action" onClick={close}>
          Cerrar
        </button>
      </header>
      <p>{p.email}</p>
      <form action={action}>
        <input type="hidden" name="user" value={p.id} />
        <div className="desk-form-grid">
          <label>
            Mover a otra mesa
            <select name="desk" defaultValue={p.deskId}>
              {data.overview.desks
                .filter((d) => d.terms.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Nivel
            <select name="level" defaultValue={p.terms?.level ?? 1}>
              {[1, 2, 3].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select name="state" defaultValue={p.terms?.state ?? "active"}>
              <option value="active">Activo</option>
              <option value="paused">Pausa</option>
              <option value="inactive">Baja</option>
            </select>
          </label>
          <label>
            Comisión de usuario (%)
            <input
              type="number"
              name="commission"
              min="0"
              max="100"
              step="0.01"
              defaultValue={p.terms ? p.terms.commission_bps / 100 : ""}
              required
            />
          </label>
          <MonthInput month={data.currentMonth} />
        </div>
        <p>
          Los cambios se aplican al período actual. El historial anterior se
          conserva.
        </p>
        <button
          className="primary-action"
          disabled={
            pending ||
            !data.ready ||
            data.month !== data.currentMonth ||
            p.access !== "active"
          }
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <p role="status">{result.message}</p>
      </form>
      <Link href={`/app/admin/${p.id}?mode=${data.mode}&period=${data.month}`}>
        Ver resumen operativo
      </Link>
      <details className="desk-history">
        <summary>Historial interno</summary>
        {records.length ? (
          records.map((h) => (
            <article key={h.id}>
              <strong>
                {h.action === "user_terms"
                    ? "Cambio de condiciones"
                    : h.action === "manager_replaced"
                      ? "Reemplazo de administrador"
                      : "Administración de mesa"}
              </strong>
              <span>
                {new Date(h.at).toLocaleString("es-AR")} · {h.actor}
              </span>
              <small>Vigencia: {monthLabel(h.month)}</small>
              {Object.keys(h.after)
                .filter(
                  (k) =>
                    !["user_id", "effective_month", "desk_id"].includes(k) &&
                    h.before?.[k] !== h.after[k],
                )
                .map((k) => (
                  <div key={k}>
                    {fieldLabel(k)}: {displayHistory(h.before?.[k], k, data)} →{" "}
                    {displayHistory(h.after[k], k, data)}
                  </div>
                ))}
              {h.before?.desk_id !== h.after.desk_id &&
                Boolean(h.after.desk_id) && (
                  <div>
                    Mesa: {displayHistory(h.before?.desk_id, "desk_id", data)} →{" "}
                    {displayHistory(h.after.desk_id, "desk_id", data)}
                  </div>
                )}
            </article>
          ))
        ) : (
          <p>Sin cambios registrados.</p>
        )}
      </details>
    </ManagementDialog>
  );
}
const fieldLabel = (key: string) =>
  ({
    level: "Nivel",
    state: "Estado",
    commission_bps: "Comisión usuario",
    manager_id: "Administrador",
    nodal_bps: "Comisión mesa",
    active: "Activa",
    direct_desks: "Mesas directas",
  })[key] ?? key;
function displayHistory(
  value: unknown,
  key: string,
  data: DeskPanelData,
): string {
  if (value === undefined || value === null) return "—";
  if (key === "desk_id")
    return (
      data.overview.desks.find((d) => d.id === value)?.name ?? String(value)
    );
  if (key === "manager_id")
    return data.overview.people.find((p) => p.id === value)?.name ?? "Usuario";
  if (key.endsWith("_bps")) return `${Number(value) / 100}%`;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}
function DeskEditor({
  desk,
  data,
  close,
}: {
  desk?: Row;
  data: DeskPanelData;
  close: () => void;
}) {
  const [result, action, pending] = useActionState(saveDesk, initial);
  const [managerId, setManagerId] = useState(desk?.terms.manager_id ?? "");
  const origin = desk?.parent_id ?? data.overview.people.find(p => p.id === managerId)?.deskId ?? ROOT_DESK;
  return (
    <ManagementDialog label="Gestionar mesa" close={close}>
      <header>
        <h2>{desk?.name ?? "Nueva mesa"}</h2>
        <button className="secondary-action" onClick={close}>
          Cerrar
        </button>
      </header>
      <form action={action}>
        <input type="hidden" name="id" value={desk?.id ?? ""} />
        <div className="desk-form-grid">
          <label>
            Nombre
            <input
              name="name"
              maxLength={80}
              defaultValue={desk?.name ?? ""}
              readOnly={!!desk}
              required
            />
          </label>
          <label>
            Administrador
            <select
              name="manager"
              value={managerId}
              onChange={event => setManagerId(event.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              {data.overview.people
                .filter(
                  (p) => p.access === "active" && (p.terms?.level ?? 1) >= 2,
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Mesa de origen
            <select
              name="parent"
              value={origin}
              disabled
            >
              {data.overview.desks
                .filter((d) => d.terms.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          {(
            <input
              type="hidden"
              name="parent"
              value={origin}
            />
          )}
          <label>
            Comisión de mesa NODAL (%)
            <input
              type="number"
              name="commission"
              min="0"
              max="100"
              step="0.01"
              defaultValue={desk ? desk.terms.nodal_bps / 100 : ""}
              required
            />
          </label>
          <MonthInput month={data.currentMonth} />
          <label className="desk-check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={desk?.terms.active ?? true}
            />
            Mesa activa
          </label>
        </div>
        <button
          className="primary-action"
          disabled={pending || !data.ready || data.month !== data.currentMonth}
        >
          {pending ? "Guardando…" : "Guardar mesa"}
        </button>
        <p role="status">{result.message}</p>
      </form>
    </ManagementDialog>
  );
}
function DeskChart({ data }: { data: DeskPanelData }) {
  const series = data.overview.desks.filter((d) => d.terms.active);
  const values = data.chart.flatMap((p) => Object.values(p.values));
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    range = high - low;
  const colors = ["var(--brand)", "#49a7dc", "#e4a456", "#ab8ee0", "#72b68c"];
  return (
    <section className="desk-surface">
      <h2>Desempeño por mesa</h2>
      <div className="desk-chart-legend">
        {series.map((d, i) => (
          <span key={d.id}>
            <i style={{ background: colors[i % colors.length] }} />
            {d.name}
          </span>
        ))}
      </div>
      <svg
        className="desk-chart"
        viewBox="0 0 800 200"
        role="img"
        aria-label="Ganancia bruta por mesa y período"
      >
        <text x="8" y="14">
          USD
        </text>
        {[0, 0.5, 1].map((n) => (
          <g key={n}>
            <line x1="80" x2="780" y1={25 + n * 130} y2={25 + n * 130} />
            <text x="5" y={29 + n * 130}>
              {Math.round((high - n * range) / 100).toLocaleString("es-AR")}
            </text>
          </g>
        ))}
        {series.map((d, i) => (
          <g key={d.id}>
            <polyline
              stroke={colors[i % colors.length]}
              points={data.chart
                .map(
                  (p, j) =>
                    `${80 + (j * 700) / Math.max(1, data.chart.length - 1)},${155 - (((p.values[d.id] ?? 0) - low) * 130) / range}`,
                )
                .join(" ")}
            />
            {data.chart.map((p, j) => (
              <circle
                key={p.month}
                cx={80 + (j * 700) / Math.max(1, data.chart.length - 1)}
                cy={155 - (((p.values[d.id] ?? 0) - low) * 130) / range}
                r="3"
                fill={colors[i % colors.length]}
              >
                <title>
                  {d.name} · {monthLabel(p.month)}: {money(p.values[d.id] ?? 0)}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {data.chart
          .filter((_, i) => i === 0 || i === data.chart.length - 1)
          .map((p, i) => (
            <text
              key={p.month}
              x={i ? 780 : 80}
              y="187"
              textAnchor={i ? "end" : "start"}
            >
              {monthLabel(p.month)}
            </text>
          ))}
      </svg>
    </section>
  );
}
