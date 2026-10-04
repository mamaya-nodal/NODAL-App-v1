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

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function DeskBranch({
  number,
  row,
  rows,
}: Readonly<{
  number: string;
  row: DeskRow;
  rows: DeskRow[];
}>) {
  const [open, setOpen] = useState(false);
  const children = rows.filter((candidate) => candidate.parent_id === row.id && candidate.terms.active);
  return (
    <div className="desk-branch">
      <article className="desk-card my-desk-branch-card">
        <div className="desk-open">
          <h3>{number} · {row.name}</h3>
          <div className="desk-metrics">
            <Metric label="Usuarios" value={String(row.members.length)} />
            <Metric label="Facturación" value={money(row.gross)} />
            <Metric label="Comisión generada" value={money(row.generated)} />
            <Metric label="Mesas derivadas" value={String(children.length)} />
          </div>
        </div>
        {children.length > 0 && (
          <button
            aria-expanded={open}
            className="secondary-action desk-expand"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? "Ocultar" : "Ver"}
          </button>
        )}
      </article>
      {open && children.length > 0 && (
        <div className="desk-children">
          {children.map((child, index) => (
            <DeskBranch key={child.id} number={`${number}.${index + 1}`} row={child} rows={rows} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ data, person }: Readonly<{ data: MyDeskPanelData; person: PersonRow }>) {
  const [open, setOpen] = useState(false);
  const summary = data.summaries[person.id];
  const suggestion = data.suggestions[person.id];
  const state = person.access !== "active"
    ? "Sin acceso"
    : person.terms?.state === "paused"
      ? "Pausa"
      : person.terms?.state === "inactive"
        ? "Baja"
        : "Activo";
  return <>
    <tr>
      <td><button aria-expanded={open} className="desk-person" onClick={() => setOpen((value) => !value)}>{person.name}</button></td>
      <td>
        <span>Nivel {person.terms?.level ?? 1}</span>
        {suggestion !== null && suggestion !== undefined && (
          <span className="desk-level-ready" title={`Cumple la referencia para Nivel ${suggestion}`}>↑ {suggestion}</span>
        )}
      </td>
      <td>{state}</td>
      <td>{money(person.gross)}</td>
      <td>{money(person.commission)}</td>
      <td>{money(person.ownIncome)}</td>
    </tr>
    {open && (
      <tr className="my-desk-user-detail">
        <td colSpan={6}>
          <div className="desk-kpis">
            <Metric label="Cuentas vírgenes" value={String(summary?.accountStates.virgin ?? 0)} />
            <Metric label="Cuentas vivas" value={String(summary?.accountStates.live ?? 0)} />
            <Metric label="Cuentas cerradas" value={String(summary?.accountStates.closed ?? 0)} />
            <Metric label="Payouts pendientes" value={String(summary?.fundingWithdrawals.filter((item) => item.collectedOn === null).length ?? 0)} />
          </div>
        </td>
      </tr>
    )}
  </>;
}

export function MyDeskPanel({ data }: Readonly<{ data: MyDeskPanelData }>) {
  const desk = data.overview.desks.find((row) => row.id === data.deskId);
  if (!desk) return <p className="notice">No se encontró la mesa administrada.</p>;
  const manager = data.overview.people.find((person) => person.id === data.userId);
  const members = data.overview.people.filter((person) => person.deskId === desk.id);
  const children = data.overview.desks.filter((row) => row.parent_id === desk.id && row.terms.active);

  return (
    <div className="admin-page admin-shell desk-admin my-desk-admin">
      <header className="desk-heading">
        <h1>{desk.name}</h1>
        <span className="calculated-badge">{monthLabel(data.month)}</span>
      </header>

      <section className="desk-kpis" aria-label="Resumen de la mesa">
        <Metric label="Usuarios" value={String(members.length)} />
        <Metric label="Facturación" value={money(desk.gross)} />
        <Metric label="Comisión generada" value={money(desk.generated)} />
        <Metric label="Mesas derivadas" value={String(children.length)} />
      </section>

      {manager && (
        <section className="desk-surface">
          <h2>Ganancias del período</h2>
          <div className="desk-kpis my-desk-income-grid">
            <Metric label="Total" value={money(manager.totalIncome)} />
            <Metric label="Operaciones propias" value={money(manager.ownIncome)} />
            <Metric label="Administración de mesa" value={money(manager.mesaIncome)} />
          </div>
        </section>
      )}

      <section className="desk-surface">
        <h2>Usuarios</h2>
        <div className="desk-table-scroll">
          <table className="desk-table">
            <thead><tr><th>Usuario</th><th>Nivel</th><th>Estado</th><th>Facturación</th><th>Com. PA</th><th>Ganancia usuario</th></tr></thead>
            <tbody>{members.map((person) => <UserRow data={data} key={person.id} person={person} />)}</tbody>
          </table>
          {members.length === 0 && <p className="desk-empty">Sin usuarios asignados.</p>}
        </div>
      </section>

      <section className="desk-surface">
        <h2>Mesas derivadas</h2>
        <div className="desk-tree-scroll">
          <div className="desk-tree-grid">
            {children.map((child, index) => <DeskBranch key={child.id} number={String(index + 1)} row={child} rows={data.overview.desks} />)}
          </div>
          {children.length === 0 && <p className="desk-empty">Sin mesas derivadas.</p>}
        </div>
      </section>
    </div>
  );
}
