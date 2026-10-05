"use client";

import { useState } from "react";

import type { MyDeskPanelData } from "@/modules/admin/server/load-my-desk";

import "../admin/desks.css";

type DeskRow = MyDeskPanelData["overview"]["desks"][number];
type PersonRow = MyDeskPanelData["overview"]["people"][number];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value / 100);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${month}T00:00:00Z`));
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Sin operaciones";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function percentage(bps: number | null | undefined) {
  return bps === null || bps === undefined ? "Sin acuerdo" : `${bps / 100}%`;
}

function Metric({ label, note, value }: Readonly<{ label: string; note?: string; value: string }>) {
  return <div><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>;
}

function HistoryChart({ data }: Readonly<{ data: MyDeskPanelData["history"] }>) {
  if (data.length === 0) return <p className="desk-empty">Sin períodos para graficar.</p>;
  const width = 760;
  const height = 190;
  const padding = 22;
  const maximum = Math.max(1, ...data.flatMap((point) => [point.structureBilling, point.totalIncome]));
  const coordinates = (field: "structureBilling" | "totalIncome") => data.map((point, index) => {
    const x = data.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (data.length - 1);
    const y = height - padding - (point[field] / maximum) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return <div className="desk-history-chart">
    <div className="desk-chart-legend">
      <span><i className="desk-chart-billing" />Facturación estructura</span>
      <span><i className="desk-chart-income" />Ganancia administrador</span>
    </div>
    <svg aria-label="Evolución por período" className="desk-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
      <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
      <polyline className="desk-chart-billing-line" points={coordinates("structureBilling")} />
      <polyline className="desk-chart-income-line" points={coordinates("totalIncome")} />
      {data.map((point, index) => {
        const x = data.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (data.length - 1);
        return <text key={point.month} textAnchor="middle" x={x} y={height - 4}>{point.month.slice(0, 7)}</text>;
      })}
    </svg>
  </div>;
}

function DeskBranch({ number, row, rows }: Readonly<{
  number: string;
  row: DeskRow;
  rows: DeskRow[];
}>) {
  const [open, setOpen] = useState(false);
  const children = rows.filter((candidate) => candidate.parent_id === row.id && candidate.terms.active);
  return <div className="desk-branch">
    <article className="desk-card my-desk-branch-card">
      <div className="desk-open">
        <h3>{number} · {row.name}</h3>
        <div className="desk-metrics">
          <Metric label="Integrantes directos" value={String(row.members.length)} />
          <Metric label="Facturación total" value={money(row.structureGross)} />
          <Metric label="Ganancia administrador" value={money(row.managerShare)} />
          <Metric label="Mesas dependientes" value={String(children.length)} />
        </div>
      </div>
      {children.length > 0 ? <button
        aria-expanded={open}
        className="secondary-action desk-expand"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >{open ? "Ocultar" : "Ver estructura"}</button> : null}
    </article>
    {open && children.length > 0 ? <div className="desk-children">
      {children.map((child, index) => <DeskBranch
        key={child.id}
        number={`${number}.${index + 1}`}
        row={child}
        rows={rows}
      />)}
    </div> : null}
  </div>;
}

function UserRow({ data, person }: Readonly<{ data: MyDeskPanelData; person: PersonRow }>) {
  const [open, setOpen] = useState(false);
  const managedDesk = data.overview.desks.find((desk) => desk.terms.active && desk.terms.manager_id === person.id);
  const profile = data.profilesByUser[person.id];
  const identities = data.identitiesByUser[person.id] ?? { active: 0, total: 0 };
  const connector = data.connectorByUser[person.id];
  const state = person.access !== "active"
    ? "Sin acceso"
    : person.terms?.state === "paused"
      ? "Pausa"
      : person.terms?.state === "inactive"
        ? "Baja"
        : "Activo";
  const role = managedDesk ? "Admin" : "Alumno";

  return <>
    <tr>
      <td><button aria-expanded={open} className="desk-person" onClick={() => setOpen((value) => !value)}>{person.name}</button></td>
      <td>{role}</td>
      <td><span className={`desk-status ${state === "Activo" ? "active" : "inactive"}`}>{state}</span></td>
      <td>{money(person.totalIncome)}</td>
      <td>{money(data.historicalBillingByUser[person.id] ?? 0)}</td>
    </tr>
    {open ? <tr className="my-desk-user-detail"><td colSpan={5}>
      <div className="desk-user-profile">
        <div className="desk-user-profile-heading">
          <div><strong>{person.name}</strong><span>{profile?.email ?? person.email}</span></div>
          <span className="calculated-badge">{role}</span>
        </div>
        <div className="desk-user-detail-grid">
          <Metric label="Estado" value={state} />
          <Metric label="Alta NODAL" value={profile?.created_at ? dateLabel(profile.created_at.slice(0, 10)) : "Sin fecha"} />
          <Metric label="Acuerdo operaciones propias" value={percentage(person.terms?.commission_bps)} />
          <Metric label="Acuerdo Admin mesa" value={managedDesk ? percentage(managedDesk.terms.nodal_bps) : "No aplica"} />
          <Metric label="Usuarios asignados" value={String(managedDesk?.members.length ?? 0)} />
          <Metric label="Última operación" value={dateLabel(data.lastOperatedOnByUser[person.id])} />
          <Metric label="Identidades" value={`${identities.active} activas`} note={`${identities.total - identities.active} inactivas o pendientes`} />
          <Metric
            label="Conector Ninja"
            value={connector?.online ? "Conectado" : connector ? "Sin señal" : "No vinculado"}
            note={connector?.version ? `Versión ${connector.version}` : undefined}
          />
        </div>
        <p className="desk-terms-note">{data.termsEditable
          ? "Ventana de 48 h abierta: los acuerdos de la estructura pueden editarse."
          : "Acuerdos en solo lectura durante el período."}</p>
      </div>
    </td></tr> : null}
  </>;
}

export function MyDeskPanel({ data }: Readonly<{ data: MyDeskPanelData }>) {
  const desk = data.deskId ? data.overview.desks.find((row) => row.id === data.deskId) : null;
  const manager = data.overview.people.find((person) => person.id === data.userId);
  if (!manager) return <p className="notice">No se pudo reconstruir el titular del panel.</p>;

  const directMembers = desk
    ? data.overview.people.filter((person) => person.deskId === desk.id)
    : [];
  const childDesks = desk
    ? data.overview.desks.filter((row) => row.parent_id === desk.id && row.terms.active)
    : [];
  const people = data.preview
    ? [manager]
    : [manager, ...data.overview.people.filter((person) => person.id !== manager.id)];
  const historicGain = data.history.reduce((total, point) => total + point.totalIncome, 0);
  const structureBilling = desk?.structureGross ?? manager.gross;
  const directBilling = desk?.gross ?? manager.gross;
  const ranking = people
    .filter((person) => person.id !== data.userId)
    .sort((left, right) => (data.priorPeriodGrossByUser[right.id] ?? 0) - (data.priorPeriodGrossByUser[left.id] ?? 0))
    .slice(0, 5);

  return <div className="admin-page admin-shell desk-admin my-desk-admin">
    <header className="desk-heading my-desk-heading">
      <div><p className="status">PANEL ADMIN</p><h1>{data.deskName ?? "Administración"}</h1></div>
      <span className="calculated-badge">{monthLabel(data.month)}</span>
    </header>

    {data.preview ? <p className="desk-preview-notice" role="status">
      Vista de comprobación · sin mesa asignada. Sólo se muestran tus propios datos.
    </p> : null}

    <section className="my-desk-summary" aria-label="Resumen administrativo">
      <article className="my-desk-hero">
        <span>Ganancia del período</span>
        <strong>{money(manager.totalIncome)}</strong>
        <small>{money(manager.ownIncome)} propias · {money(manager.mesaIncome)} administración</small>
      </article>
      <article className="my-desk-summary-card"><Metric label="Ganancia histórica" value={money(historicGain)} /></article>
      <article className="my-desk-summary-card"><Metric label="Facturación del período" value={money(structureBilling)} /></article>
      <article className="my-desk-summary-card"><Metric label="Integrantes mesa principal" value={String(directMembers.length)} /></article>
      <article className="my-desk-summary-card"><Metric label="Mesas dependientes" value={String(Math.max(0, data.overview.desks.length - (desk ? 1 : 0)))} /></article>
    </section>

    <section className="my-desk-structure-summary">
      <article className="my-desk-structure-primary">
        <span>Toda la estructura</span>
        <strong>{money(structureBilling)}</strong>
        <small>{desk?.structureMembers.length ?? 0} integrantes · {Math.max(0, data.overview.desks.length - (desk ? 1 : 0))} mesas dependientes</small>
      </article>
      <article><Metric label="Mesa directa" value={money(directBilling)} note={`${directMembers.length} integrantes`} /></article>
    </section>

    <section className="desk-surface">
      <div className="admin-section-heading"><div><p className="status">EVOLUCIÓN</p><h2>Resultados por período</h2></div></div>
      <HistoryChart data={data.history} />
    </section>

    <section className="desk-surface">
      <div className="admin-section-heading"><div><p className="status">ESTRUCTURA</p><h2>Usuarios</h2></div><span className="calculated-badge">{people.length}</span></div>
      <div className="desk-table-scroll"><table className="desk-table">
        <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Ganancia período</th><th>Facturación histórica</th></tr></thead>
        <tbody>{people.map((person) => <UserRow data={data} key={person.id} person={person} />)}</tbody>
      </table></div>
    </section>

    <div className="my-desk-lower-grid">
      <section className="desk-surface">
        <div className="admin-section-heading"><div><p className="status">DEPENDENCIAS</p><h2>Estructura de mesas</h2></div></div>
        <div className="desk-tree-scroll"><div className="desk-tree-grid">
          {childDesks.map((child, index) => <DeskBranch key={child.id} number={String(index + 1)} row={child} rows={data.overview.desks} />)}
        </div>{childDesks.length === 0 ? <p className="desk-empty">Sin mesas dependientes.</p> : null}</div>
      </section>

      <section className="desk-surface">
        <div className="admin-section-heading"><div><p className="status">PERÍODO ANTERIOR</p><h2>Ranking de la estructura</h2></div></div>
        <ol className="desk-ranking">{ranking.map((person, index) => <li key={person.id}>
          <span>{index + 1}</span><div><strong>{person.name}</strong><small>{money(data.priorPeriodGrossByUser[person.id] ?? 0)}</small></div>
        </li>)}</ol>
        {ranking.length === 0 ? <p className="desk-empty">Sin integrantes para ordenar.</p> : null}
      </section>
    </div>
  </div>;
}
