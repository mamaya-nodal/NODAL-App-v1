"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { MasterControlData } from "@/modules/admin/server/load-master-control";
import { ROOT_DESK } from "@/modules/admin/domain/desks";

import "./desks.css";
import "./master-control.css";

type Person = MasterControlData["overview"]["people"][number];
type BoardNode = Readonly<{
  children: BoardNode[];
  detail: string;
  id: string;
  label: string;
  personId?: string;
  tone: "gray" | "lime";
}>;
type PositionedNode = BoardNode & { x: number; y: number };

const money = (value: number) => new Intl.NumberFormat("es-AR", {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency",
}).format(value / 100);

const monthLabel = (value: string) => new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
}).format(new Date(`${value}T00:00:00Z`));

const dateTimeLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Sin transmisiones";

function Metric({ label, note, value }: Readonly<{ label: string; note?: string; value: string }>) {
  return <article><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}

function SystemChart({ history }: Readonly<{ history: MasterControlData["performanceHistory"] }>) {
  if (!history.length) return <p className="desk-empty">Sin períodos para graficar.</p>;
  const width = 760;
  const height = 190;
  const padding = 24;
  const maximum = Math.max(1, ...history.flatMap((point) => [point.gross, point.nodalIncome]));
  const points = (field: "gross" | "nodalIncome") => history.map((point, index) => {
    const x = history.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (history.length - 1);
    const y = height - padding - (point[field] / maximum) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  return <div className="desk-history-chart master-chart">
    <div className="desk-chart-legend"><span><i className="desk-chart-billing" />Facturación</span><span><i className="desk-chart-income" />Ganancia NODAL</span></div>
    <svg aria-label="Desempeño del Sistema NODAL" className="desk-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
      <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
      <polyline className="desk-chart-billing-line" points={points("gross")} />
      <polyline className="desk-chart-income-line" points={points("nodalIncome")} />
      {history.map((point, index) => {
        const x = history.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (history.length - 1);
        return <text key={point.month} textAnchor="middle" x={x} y={height - 4}>{point.month.slice(0, 7)}</text>;
      })}
    </svg>
  </div>;
}

function Ranking({ people }: Readonly<{ people: Person[] }>) {
  const ranking = [...people].sort((left, right) => right.gross - left.gross);
  const podium = ranking.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as Person[];
  return <div className="master-ranking">
    <div className="desk-podium">{order.map((person) => {
      const position = ranking.findIndex((candidate) => candidate.id === person.id) + 1;
      return <article className={`place-${position}`} key={person.id}><span>{position === 1 ? "🏆" : position === 2 ? "🥈" : "🥉"}</span><strong>{person.name}</strong><small>{money(person.gross)}</small><b>{position}</b></article>;
    })}</div>
    {ranking.length > 3 ? <ol className="desk-ranking-rest" start={4}>{ranking.slice(3, 8).map((person) => <li key={person.id}><strong>{person.name}</strong><span>{money(person.gross)}</span></li>)}</ol> : null}
    {!ranking.length ? <p className="desk-empty">No hay usuarios activos para ordenar.</p> : null}
  </div>;
}

function buildBoardTree(data: MasterControlData, people: Person[]): BoardNode {
  const activeDesks = data.overview.desks.filter((desk) => desk.terms.active);
  const unit = data.units[0];
  const personNode = (person: Person, ancestors: ReadonlySet<string>): BoardNode => {
    if (ancestors.has(person.id)) return { children: [], detail: "", id: `person-${person.id}`, label: person.name, personId: person.id, tone: "gray" };
    const managed = activeDesks.find((desk) => desk.terms.manager_id === person.id && desk.id !== ROOT_DESK);
    const nextAncestors = new Set(ancestors).add(person.id);
    const children = managed
      ? people.filter((candidate) => candidate.deskId === managed.id && candidate.id !== person.id).map((candidate) => personNode(candidate, nextAncestors))
      : [];
    return {
      children,
      detail: managed ? `${managed.structureMembers.length} integrantes · ${money(managed.structureGross)}` : "Usuario",
      id: `person-${person.id}`,
      label: person.name,
      personId: person.id,
      tone: managed ? "lime" : "gray",
    };
  };
  const mainPeople = people.filter((person) => person.deskId === (unit?.root_desk_id ?? ROOT_DESK));
  return {
    children: [{
      children: mainPeople.map((person) => personNode(person, new Set())),
      detail: `${people.length} usuarios activos`,
      id: `unit-${unit?.id ?? "nodal"}`,
      label: `${String(unit?.ordinal ?? 1).padStart(2, "0")} · ${unit?.name ?? "Unidad NODAL"}`,
      tone: "lime",
    }],
    detail: `${data.units.length} unidad operativa`,
    id: "system-nodal",
    label: "SISTEMA NODAL",
    tone: "lime",
  };
}

function layoutBoard(root: BoardNode) {
  const nodeWidth = 166;
  const horizontalGap = 38;
  const verticalGap = 138;
  const widths = new Map<string, number>();
  let depth = 0;
  const width = (node: BoardNode): number => {
    if (!node.children.length) { widths.set(node.id, nodeWidth); return nodeWidth; }
    const childrenWidth = node.children.reduce((total, child, index) => total + width(child) + (index ? horizontalGap : 0), 0);
    const result = Math.max(nodeWidth, childrenWidth);
    widths.set(node.id, result);
    return result;
  };
  const totalWidth = width(root);
  const nodes: PositionedNode[] = [];
  const edges: Array<{ child: PositionedNode; parent: PositionedNode }> = [];
  const place = (node: BoardNode, left: number, level: number, parent?: PositionedNode) => {
    depth = Math.max(depth, level);
    const subtreeWidth = widths.get(node.id) ?? nodeWidth;
    const positioned: PositionedNode = { ...node, x: left + (subtreeWidth - nodeWidth) / 2, y: 46 + level * verticalGap };
    nodes.push(positioned);
    if (parent) edges.push({ child: positioned, parent });
    let childLeft = left;
    for (const child of node.children) {
      place(child, childLeft, level + 1, positioned);
      childLeft += (widths.get(child.id) ?? nodeWidth) + horizontalGap;
    }
  };
  place(root, 72, 0);
  return { canvasHeight: Math.max(650, 120 + (depth + 1) * verticalGap), canvasWidth: Math.max(1240, totalWidth + 144), edges, nodes };
}

function SystemBoard({ data, onOpenUser, people }: Readonly<{ data: MasterControlData; onOpenUser: (id: string) => void; people: Person[] }>) {
  const tree = useMemo(() => buildBoardTree(data, people), [data, people]);
  const layout = useMemo(() => layoutBoard(tree), [tree]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const viewportRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const dragRef = useRef<{ originX: number; originY: number; panX: number; panY: number } | null>(null);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space" && hoverRef.current) { event.preventDefault(); setSpaceHeld(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const center = () => {
    const root = layout.nodes[0];
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    if (root && viewportWidth) setPan({ x: viewportWidth / 2 - (root.x + 83) * zoom, y: 0 });
  };
  useEffect(center, [layout, zoom]);
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!spaceHeld && event.button !== 1) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { originX: event.clientX, originY: event.clientY, panX: pan.x, panY: pan.y };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.panX + event.clientX - dragRef.current.originX, y: dragRef.current.panY + event.clientY - dragRef.current.originY });
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="desk-board-shell master-board"><div className="desk-board-toolbar"><span>Espacio + arrastrar para explorar</span><div className="desk-board-controls">
    <button disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))} type="button">−</button><output>{Math.round(zoom * 100)}%</output><button disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))} type="button">+</button><button className="desk-board-center" onClick={center} type="button">Centrar</button>
  </div></div><div className={`desk-board-viewport ${spaceHeld ? "ready" : ""}`} onMouseEnter={() => { hoverRef.current = true; }} onMouseLeave={() => { hoverRef.current = false; setSpaceHeld(false); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} ref={viewportRef}>
    <div className="desk-board-canvas" style={{ height: layout.canvasHeight, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: layout.canvasWidth }}>
      <svg aria-hidden className="desk-board-lines" height={layout.canvasHeight} width={layout.canvasWidth}>{layout.edges.map(({ child, parent }) => { const middleY = parent.y + 64 + (child.y - parent.y - 64) / 2; return <path d={`M ${parent.x + 83} ${parent.y + 64} V ${middleY} H ${child.x + 83} V ${child.y}`} key={`${parent.id}-${child.id}`} />; })}</svg>
      {layout.nodes.map((node) => <article className={`desk-board-node ${node.tone} ${expanded.has(node.id) ? "expanded" : ""}`} key={node.id} style={{ left: node.x, top: node.y }}>
        {node.personId ? <button className="desk-board-node-name" onClick={() => onOpenUser(node.personId!)} type="button">{node.label}</button> : <strong>{node.label}</strong>}
        <button className="desk-board-node-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })} type="button">{expanded.has(node.id) ? "−" : "+"}</button>
        {expanded.has(node.id) ? <small>{node.detail}</small> : null}
      </article>)}
    </div>
  </div></div>;
}

function MasterUserModal({ data, onClose, person }: Readonly<{ data: MasterControlData; onClose: () => void; person: Person }>) {
  const profile = data.profilesByUser[person.id];
  const identities = data.identitiesByUser[person.id] ?? [];
  const connector = data.connectorByUser[person.id];
  const managedDesk = data.overview.desks.find((desk) => desk.terms.active && desk.terms.manager_id === person.id);
  const identifier = data.identifiersByUser[person.id] ?? "ID pendiente";
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div aria-modal="true" className="desk-modal-backdrop" role="dialog" onMouseDown={onClose}><section className="desk-user-modal master-user-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span>USUARIO NODAL</span><h2>{identifier} / {person.name}</h2></div><button className="desk-modal-close" onClick={onClose} type="button">×</button></header>
    <div className="master-user-metrics"><Metric label="Ganancia período" value={money(person.gross)} /><Metric label="Facturación histórica" value={money(data.historicalGrossByUser[person.id] ?? 0)} /><Metric label="Identidades" value={String(identities.length)} /></div>
    <div className="desk-user-fields"><label>Estado<input disabled value={person.access === "active" ? "Activo" : "Revocado"} /></label><label>Email de acceso<input disabled value={profile?.email ?? person.email} /></label><label>Email de contacto<input disabled value={profile?.contact_email ?? profile?.email ?? person.email} /></label><label>Rol<input disabled value={managedDesk ? "Admin" : "Usuario"} /></label></div>
    <section className="desk-agreement-block"><h3>Acuerdo % NODAL</h3><label>Operaciones propias<div><input disabled value={(person.terms?.commission_bps ?? 0) / 100} /><span>%</span></div></label>{managedDesk ? <label>Admin mesa<div><input disabled value={managedDesk.terms.nodal_bps / 100} /><span>%</span></div></label> : null}<small>Admin Master puede modificar estos valores desde la gestión administrativa.</small></section>
    <div className="desk-user-switches"><article className="desk-ninja-state"><span>Conexión Ninja<small>Última transmisión: {dateTimeLabel(connector?.lastSeenAt)}</small></span><div><strong className={connector?.active ? "active" : "inactive"}>{connector?.active ? "Activo" : "Desactivado"}</strong><small>{connector?.version ? `Conector v${connector.version}` : "Sin versión registrada"}</small></div></article><article><span>Identidades<small>Administradas por el titular</small></span><strong>{profile?.identities_enabled ? "Habilitadas" : "No habilitadas"}</strong></article></div>
    {identities.length ? <div className="desk-identities-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th></tr></thead><tbody>{identities.map((identity) => <tr key={identity.id}><td>{identity.id.slice(0, 8)}</td><td>{identity.name}</td><td>{identity.state}</td></tr>)}</tbody></table></div> : null}
    <footer><button className="secondary-action" onClick={onClose} type="button">Cerrar</button><Link className="primary-action" href={`/app/admin/${person.id}`}>Ver registros del usuario</Link></footer>
  </section></div>;
}

export function MasterControlPanel({ data, view = "control" }: Readonly<{ data: MasterControlData; view?: "control" | "statistics" }>) {
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const activePeople = useMemo(() => data.overview.people.filter((person) => person.access === "active"), [data.overview.people]);
  const visiblePeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return activePeople;
    return activePeople.filter((person) => `${person.name} ${person.email} ${data.identifiersByUser[person.id] ?? ""}`.toLowerCase().includes(normalized));
  }, [activePeople, data.identifiersByUser, query]);
  const selected = activePeople.find((person) => person.id === selectedPersonId) ?? null;
  const historicNodal = data.performanceHistory.reduce((sum, point) => sum + point.nodalIncome, 0);
  const historicGross = data.performanceHistory.reduce((sum, point) => sum + point.gross, 0);
  return <div className="admin-page admin-shell master-control">
    <header className="desk-heading master-heading"><div><p className="status">ADMIN MASTER</p><h1>{view === "statistics" ? "Estadísticas" : "Panel control"}</h1><small>{monthLabel(data.month)}</small></div>{view === "control" ? <Link className={`master-alerts ${data.pendingAccessCount ? "has-alerts" : ""}`} href="/app/admin/users"><span>{data.pendingAccessCount}</span><strong>Altas y alertas</strong></Link> : null}</header>
    <form action="/app/admin" className="master-filters" method="get"><label>Unidad<select defaultValue={data.units[0]?.id}>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{String(unit.ordinal).padStart(2, "0")} · {unit.name}</option>)}</select></label><label>Mesa<select defaultValue="all"><option value="all">Todas las mesas</option>{data.overview.desks.filter((desk) => desk.terms.active).map((desk) => <option key={desk.id} value={desk.id}>{desk.name}</option>)}</select></label><label>ID o nombre de usuario<input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario" value={query} /></label><label>Período<select name="period" defaultValue={data.month}>{data.periods.map((period) => <option key={period} value={period}>{monthLabel(period)}</option>)}</select></label><button className="primary-action">Aplicar</button></form>
    <section className="master-kpis"><Metric label="Ganancia NODAL del período" value={money(data.overview.nodalIncome)} /><Metric label="Ganancia NODAL histórica" value={money(historicNodal)} /><Metric label="Facturación total del período" value={money(data.overview.gross)} /><Metric label="Facturación histórica" value={money(historicGross)} /><Metric label="Unidades operativas" value={String(data.units.length)} /><Metric label="Usuarios activos" value={String(activePeople.length)} /></section>
    <section className="master-dashboard-grid"><article className="desk-surface"><div className="admin-section-heading"><div><h2>Desempeño por unidad</h2></div></div><SystemChart history={data.performanceHistory} /></article><article className="desk-surface"><div className="admin-section-heading"><div><h2>Ranking NODAL</h2></div></div><Ranking people={activePeople} /></article></section>
    {view === "control" ? <section className="master-unit-card"><div><span>{String(data.units[0]?.ordinal ?? 1).padStart(2, "0")}</span><div><p>UNIDAD</p><h2>{data.units[0]?.name ?? "Unidad NODAL"}</h2></div></div><dl><div><dt>Facturación período</dt><dd>{money(data.overview.gross)}</dd></div><div><dt>Ganancia NODAL</dt><dd>{money(data.overview.nodalIncome)}</dd></div><div><dt>Mesas</dt><dd>{data.overview.desks.filter((desk) => desk.terms.active).length}</dd></div><div><dt>Usuarios</dt><dd>{activePeople.length}</dd></div></dl></section> : null}
    <section className="desk-surface"><div className="admin-section-heading"><div><h2>Usuarios de la unidad</h2></div><span className="calculated-badge">{visiblePeople.length}</span></div><div className="desk-table-scroll"><table className="desk-table"><thead><tr><th>ID</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Ganancia período</th><th>Facturación histórica</th></tr></thead><tbody>{visiblePeople.map((person) => { const managed = data.overview.desks.some((desk) => desk.terms.active && desk.terms.manager_id === person.id); return <tr key={person.id}><td><span className="desk-user-id">{data.identifiersByUser[person.id] ?? "ID pendiente"}</span></td><td><button className="desk-person" onClick={() => setSelectedPersonId(person.id)} type="button">{person.name}</button></td><td>{managed ? "Admin" : "Usuario"}</td><td><span className="desk-status active">Activo</span></td><td>{money(person.gross)}</td><td>{money(data.historicalGrossByUser[person.id] ?? 0)}</td></tr>; })}</tbody></table>{!visiblePeople.length ? <p className="desk-empty">No hay coincidencias.</p> : null}</div></section>
    {view === "control" ? <section className="desk-surface desk-board-section"><div className="admin-section-heading"><div><h2>Sistema NODAL</h2></div></div><SystemBoard data={data} onOpenUser={setSelectedPersonId} people={activePeople} /></section> : null}
    {selected ? <MasterUserModal data={data} onClose={() => setSelectedPersonId(null)} person={selected} /> : null}
  </div>;
}
