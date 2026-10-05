"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { MyDeskPanelData } from "@/modules/admin/server/load-my-desk";

import "../admin/desks.css";

type DeskRow = MyDeskPanelData["overview"]["desks"][number];
type PersonRow = MyDeskPanelData["overview"]["people"][number];

type EditablePerson = {
  adminBps: number | null;
  assignedUserIds: string[];
  commissionBps: number | null;
  connectorActive: boolean;
  email: string;
  identitiesEnabled: boolean;
  role: "admin" | "student";
  state: "active" | "paused" | "inactive";
};

type BoardNode = {
  children: BoardNode[];
  detail: string;
  id: string;
  kind: "system" | "desk" | "person";
  label: string;
  personId?: string;
  tone: "gray" | "lime";
};

type PositionedNode = BoardNode & { x: number; y: number };

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

function roleFor(data: MyDeskPanelData, person: PersonRow) {
  const managedDesk = data.overview.desks.find((desk) => desk.terms.active && desk.terms.manager_id === person.id);
  if (person.id === data.userId) return "Titular";
  return managedDesk ? "Admin" : "Alumno";
}

function stateLabel(state: EditablePerson["state"]) {
  if (state === "paused") return "Pausa";
  if (state === "inactive") return "Baja";
  return "Activo";
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

function UserPerformanceChart({ data }: Readonly<{
  data: MyDeskPanelData["detailByUser"][string]["performance"];
}>) {
  if (data.length === 0) return <p className="desk-empty">Sin historial de desempeño.</p>;
  const width = 430;
  const height = 116;
  const padding = 18;
  const maximum = Math.max(1, ...data.map((point) => point.amount));
  const points = data.map((point, index) => {
    const x = data.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (data.length - 1);
    const y = height - 28 - (point.amount / maximum) * (height - 46);
    return `${x},${y}`;
  }).join(" ");
  return <svg aria-label="Desempeño del usuario" className="desk-user-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
    {[28, 54, 80].map((y) => <line key={y} x1={padding} x2={width - padding} y1={y} y2={y} />)}
    <polyline points={points} />
    {data.map((point, index) => {
      const x = data.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (data.length - 1);
      const y = height - 28 - (point.amount / maximum) * (height - 46);
      return <g key={`${point.label}-${index}`}><circle cx={x} cy={y} r="4" /><text textAnchor="middle" x={x} y={height - 7}>{point.label}</text></g>;
    })}
  </svg>;
}

function buildEditablePeople(data: MyDeskPanelData) {
  return Object.fromEntries(data.overview.people.map((person) => {
    const managedDesk = data.overview.desks.find((desk) => desk.terms.active && desk.terms.manager_id === person.id);
    const connector = data.connectorByUser[person.id];
    const identities = data.identitiesByUser[person.id] ?? { active: 0, total: 0 };
    return [person.id, {
      adminBps: managedDesk?.terms.nodal_bps ?? null,
      assignedUserIds: [...(managedDesk?.members ?? [])],
      commissionBps: person.terms?.commission_bps ?? null,
      connectorActive: connector?.online ?? false,
      email: data.profilesByUser[person.id]?.email ?? person.email,
      identitiesEnabled: identities.total > 0,
      role: managedDesk ? "admin" : "student",
      state: (person.terms?.state ?? "active") as EditablePerson["state"],
    } satisfies EditablePerson];
  })) as Record<string, EditablePerson>;
}

function UserDetailModal({ data, editable, onClose, onSave, person }: Readonly<{
  data: MyDeskPanelData;
  editable: EditablePerson;
  onClose: () => void;
  onSave: (next: EditablePerson) => void;
  person: PersonRow;
}>) {
  const [draft, setDraft] = useState(editable);
  const [saved, setSaved] = useState(false);
  const details = data.detailByUser[person.id];
  const identities = details?.identities ?? [];
  const connector = data.connectorByUser[person.id];
  const canEdit = data.demo || data.termsEditable;
  const identifier = data.displayIdByUser[person.id] || "ID pendiente";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function save() {
    if (draft.state === "inactive" && !window.confirm(`¿Está seguro de que quiere dar de baja a ${person.name}?`)) return;
    onSave(draft);
    setSaved(true);
  }

  return <div aria-labelledby="desk-user-dialog-title" aria-modal="true" className="desk-modal-backdrop" role="dialog" onMouseDown={onClose}>
    <section className="desk-user-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span>USUARIO NODAL</span><h2 id="desk-user-dialog-title">{identifier} / {person.name}</h2></div>
        <button aria-label="Cerrar ficha" className="desk-modal-close" onClick={onClose} type="button">×</button>
      </header>
      <UserPerformanceChart data={details?.performance ?? []} />
      <div className="desk-user-highlight-row">
        <article className="desk-best-trade"><span>Mejor trade</span><strong>🏆 {details?.bestTrade ? money(details.bestTrade.amount) : "Sin datos"}</strong><small>{details?.bestTrade ? dateLabel(details.bestTrade.date) : "—"}</small></article>
        <div className="desk-user-quick-data"><span>Última operación<strong>{dateLabel(data.lastOperatedOnByUser[person.id])}</strong></span><span>Ruta mayor ganancia<strong>{details?.largestGainRoute ?? "Sin datos"}</strong></span></div>
      </div>
      <div className="desk-user-fields">
        <label>Estado<select disabled={!canEdit} value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as EditablePerson["state"] })}><option value="active">Activo</option><option value="paused">Pausa</option><option value="inactive">Baja</option></select></label>
        <label>Email<input disabled={!canEdit} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label>Rol<select disabled={!canEdit || person.id === data.userId} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as EditablePerson["role"] })}><option value="student">Alumno</option><option value="admin">Admin</option></select></label>
      </div>
      {draft.role === "admin" ? <fieldset className="desk-assigned-users">
        <legend>Usuarios adjudicados</legend><p>Un administrador puede tener más de un usuario a cargo.</p>
        <div>{data.overview.people.filter((candidate) => candidate.id !== person.id).map((candidate) => <label key={candidate.id}>
          <input checked={draft.assignedUserIds.includes(candidate.id)} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, assignedUserIds: event.target.checked ? [...draft.assignedUserIds, candidate.id] : draft.assignedUserIds.filter((id) => id !== candidate.id) })} type="checkbox" />{data.displayIdByUser[candidate.id] || "Sin ID"} · {candidate.name}
        </label>)}</div>
      </fieldset> : null}
      <section className="desk-agreement-block">
        <h3>Acuerdo % NODAL</h3>
        <label>Operaciones propias<div><input disabled={!canEdit} max="100" min="0" step="0.01" type="number" value={(draft.commissionBps ?? 0) / 100} onChange={(event) => setDraft({ ...draft, commissionBps: Math.round(Number(event.target.value) * 100) })} /><span>%</span></div></label>
        {draft.role === "admin" ? <label>Admin mesa<div><input disabled={!canEdit} max="100" min="0" step="0.01" type="number" value={(draft.adminBps ?? 0) / 100} onChange={(event) => setDraft({ ...draft, adminBps: Math.round(Number(event.target.value) * 100) })} /><span>%</span></div></label> : null}
        <small>{data.termsEditable || data.demo ? "Ventana de edición habilitada." : "Solo lectura durante el período."}</small>
      </section>
      <div className="desk-user-switches">
        <label><span>Conexión Ninja<small>{connector?.version ? `Conector v${connector.version}` : "Sin versión registrada"}</small></span><select disabled={!canEdit} value={draft.connectorActive ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, connectorActive: event.target.value === "active" })}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
        <label><span>Identidades<small>{identities.length} registradas</small></span><select disabled={!canEdit} value={draft.identitiesEnabled ? "enabled" : "disabled"} onChange={(event) => setDraft({ ...draft, identitiesEnabled: event.target.value === "enabled" })}><option value="enabled">Habilitadas</option><option value="disabled">No habilitadas</option></select></label>
      </div>
      {draft.identitiesEnabled ? <div className="desk-identities-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Ganancia período</th><th>Facturación</th></tr></thead><tbody>{identities.map((identity) => <tr key={identity.id}><td>{identity.id}</td><td>{identity.name}</td><td>{identity.state}</td><td>{money(identity.periodGain)}</td><td>{money(identity.billing)}</td></tr>)}</tbody></table>{identities.length === 0 ? <p>Este usuario no tiene identidades registradas.</p> : null}</div> : null}
      {saved ? <p className="desk-modal-saved" role="status">Cambios aplicados al escenario de prueba.</p> : null}
      <footer><button className="secondary-action" onClick={onClose} type="button">Cancelar</button><button className="primary-action" disabled={!canEdit} onClick={save} type="button">Guardar cambios</button></footer>
    </section>
  </div>;
}

function InvitationPanel({ data }: Readonly<{ data: MyDeskPanelData }>) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviter, setInviter] = useState(data.userId);
  const [sent, setSent] = useState<readonly { approved: boolean; email: string; inviter: string }[]>([{ approved: true, email: "demo.aprobado@nodal.test", inviter: data.userId }]);
  const people = data.overview.people;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setSent((current) => [{ approved: false, email: email.trim(), inviter }, ...current]);
    setEmail("");
  }

  return <section className="desk-surface desk-invitation-panel">
    <button aria-expanded={open} className="desk-add-user" onClick={() => setOpen((value) => !value)} type="button"><span>+ Agregar usuario</span><span>{open ? "−" : "+"}</span></button>
    {open ? <div className="desk-invitation-content"><form onSubmit={submit}>
      <label>Email<input placeholder="persona@correo.com" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Invitación enviada por<select value={inviter} onChange={(event) => setInviter(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.id === data.userId ? "Titular · " : ""}{person.name}</option>)}</select></label>
      <button className="primary-action" type="submit">Enviar invitación</button>
    </form><div className="desk-invitation-statuses">{sent.map((invitation, index) => {
      const sender = people.find((person) => person.id === invitation.inviter)?.name ?? "Titular";
      return <article key={`${invitation.email}-${index}`}><span>{invitation.approved ? "✓" : "→"}</span><div><strong>{invitation.email}</strong><small>{invitation.approved ? `Aprobado como usuario NODAL · invitado por ${sender}` : `Invitación enviada por ${sender}`}</small></div></article>;
    })}</div>{data.demo ? <p className="desk-demo-footnote">En este escenario el envío es simulado y no genera correos ni altas reales.</p> : null}</div> : null}
  </section>;
}

function buildBoardTree(data: MyDeskPanelData, rootDesk: DeskRow | null, manager: PersonRow): BoardNode {
  const desks = data.overview.desks.filter((desk) => desk.terms.active);
  const people = data.overview.people;
  function deskNode(desk: DeskRow): BoardNode {
    const members = people.filter((person) => person.deskId === desk.id);
    return { children: members.map(personNode), detail: `${desk.structureMembers.length} integrantes · ${money(desk.structureGross)}`, id: `desk-${desk.id}`, kind: "desk", label: desk.name, tone: "lime" };
  }
  function personNode(person: PersonRow): BoardNode {
    const managed = desks.filter((desk) => desk.terms.manager_id === person.id && desk.id !== rootDesk?.id);
    return { children: managed.map(deskNode), detail: `${roleFor(data, person)} · ${money(person.totalIncome)}`, id: `person-${person.id}`, kind: "person", label: person.name, personId: person.id, tone: managed.length > 0 || person.id === data.userId ? "lime" : "gray" };
  }
  const deskTree = rootDesk ? deskNode(rootDesk) : personNode(manager);
  if (rootDesk && !deskTree.children.some((node) => node.personId === manager.id)) deskTree.children.unshift(personNode(manager));
  return { children: [deskTree], detail: "Estructura completa", id: "system-root", kind: "system", label: "SISTEMA NODAL", tone: "lime" };
}

function layoutBoard(root: BoardNode) {
  const nodeWidth = 166;
  const horizontalGap = 38;
  const verticalGap = 138;
  const widths = new Map<string, number>();
  let depth = 0;
  function width(node: BoardNode): number {
    if (node.children.length === 0) { widths.set(node.id, nodeWidth); return nodeWidth; }
    const childrenWidth = node.children.reduce((total, child, index) => total + width(child) + (index > 0 ? horizontalGap : 0), 0);
    const result = Math.max(nodeWidth, childrenWidth); widths.set(node.id, result); return result;
  }
  const totalWidth = width(root);
  const nodes: PositionedNode[] = [];
  const edges: { child: PositionedNode; parent: PositionedNode }[] = [];
  function place(node: BoardNode, left: number, level: number, parent?: PositionedNode) {
    depth = Math.max(depth, level);
    const subtreeWidth = widths.get(node.id) ?? nodeWidth;
    const positioned: PositionedNode = { ...node, x: left + (subtreeWidth - nodeWidth) / 2, y: 46 + level * verticalGap };
    nodes.push(positioned); if (parent) edges.push({ child: positioned, parent });
    let childLeft = left;
    for (const child of node.children) { place(child, childLeft, level + 1, positioned); childLeft += (widths.get(child.id) ?? nodeWidth) + horizontalGap; }
  }
  place(root, 72, 0);
  return { canvasHeight: Math.max(650, 120 + (depth + 1) * verticalGap), canvasWidth: Math.max(1240, totalWidth + 144), edges, nodes };
}

function StructureBoard({ data, manager, onOpenUser, rootDesk }: Readonly<{ data: MyDeskPanelData; manager: PersonRow; onOpenUser: (id: string) => void; rootDesk: DeskRow | null }>) {
  const tree = useMemo(() => buildBoardTree(data, rootDesk, manager), [data, manager, rootDesk]);
  const layout = useMemo(() => layoutBoard(tree), [tree]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const hoverRef = useRef(false);
  const dragRef = useRef<{ originX: number; originY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code !== "Space" || !hoverRef.current) return; event.preventDefault(); setSpaceHeld(true); };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!spaceHeld && event.button !== 1) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { originX: event.clientX, originY: event.clientY, panX: pan.x, panY: pan.y };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.panX + event.clientX - dragRef.current.originX, y: dragRef.current.panY + event.clientY - dragRef.current.originY });
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="desk-board-shell"><div className="desk-board-toolbar"><span>Espacio + arrastrar para explorar</span><button onClick={() => setPan({ x: 0, y: 0 })} type="button">Centrar</button></div>
    <div className={`desk-board-viewport ${spaceHeld ? "ready" : ""}`} onMouseEnter={() => { hoverRef.current = true; }} onMouseLeave={() => { hoverRef.current = false; setSpaceHeld(false); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={(event) => { event.preventDefault(); setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY })); }}>
      <div className="desk-board-canvas" style={{ height: layout.canvasHeight, transform: `translate(${pan.x}px, ${pan.y}px)`, width: layout.canvasWidth }}>
        <svg aria-hidden="true" className="desk-board-lines" height={layout.canvasHeight} width={layout.canvasWidth}>{layout.edges.map(({ child, parent }) => { const startX = parent.x + 83; const startY = parent.y + 64; const endX = child.x + 83; const endY = child.y; const middleY = startY + (endY - startY) / 2; return <path d={`M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`} key={`${parent.id}-${child.id}`} />; })}</svg>
        {layout.nodes.map((node) => <article className={`desk-board-node ${node.tone} ${expanded.has(node.id) ? "expanded" : ""}`} key={node.id} style={{ left: node.x, top: node.y }}>
          {node.personId ? <button className="desk-board-node-name" onClick={() => onOpenUser(node.personId!)} type="button">{node.label}</button> : <strong>{node.label}</strong>}
          <button aria-expanded={expanded.has(node.id)} aria-label={`Ver información de ${node.label}`} className="desk-board-node-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })} type="button">{expanded.has(node.id) ? "−" : "+"}</button>
          {expanded.has(node.id) ? <small>{node.detail}{node.personId ? <><br />{data.displayIdByUser[node.personId] || "ID pendiente"}</> : null}</small> : null}
        </article>)}
      </div>
    </div>
  </div>;
}

function Ranking({ data, people }: Readonly<{ data: MyDeskPanelData; people: PersonRow[] }>) {
  const ranking = people.filter((person) => person.id !== data.userId).sort((left, right) => (data.priorPeriodGrossByUser[right.id] ?? 0) - (data.priorPeriodGrossByUser[left.id] ?? 0));
  const podium = ranking.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as PersonRow[];
  return <><div className="desk-podium">{order.map((person) => { const position = ranking.findIndex((candidate) => candidate.id === person.id) + 1; return <article className={`place-${position}`} key={person.id}><span>{position === 1 ? "🏆" : position === 2 ? "🥈" : "🥉"}</span><strong>{person.name}</strong><small>{money(data.priorPeriodGrossByUser[person.id] ?? 0)}</small><b>{position}</b></article>; })}</div>
    {ranking.length > 3 ? <ol className="desk-ranking-rest" start={4}>{ranking.slice(3).map((person) => <li key={person.id}><strong>{person.name}</strong><span>{money(data.priorPeriodGrossByUser[person.id] ?? 0)}</span></li>)}</ol> : null}
    {ranking.length === 0 ? <p className="desk-empty">Sin integrantes para ordenar.</p> : null}</>;
}

export function MyDeskPanel({ data }: Readonly<{ data: MyDeskPanelData }>) {
  const desk = data.deskId ? data.overview.desks.find((row) => row.id === data.deskId) ?? null : null;
  const manager = data.overview.people.find((person) => person.id === data.userId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editableByUser, setEditableByUser] = useState(() => buildEditablePeople(data));
  if (!manager) return <p className="notice">No se pudo reconstruir el titular del panel.</p>;
  const directMembers = desk ? data.overview.people.filter((person) => person.deskId === desk.id) : [];
  const people = data.preview ? [manager] : [manager, ...data.overview.people.filter((person) => person.id !== manager.id)];
  const historicGain = data.history.reduce((total, point) => total + point.totalIncome, 0);
  const structureBilling = desk?.structureGross ?? manager.gross;
  const directBilling = desk?.gross ?? manager.gross;
  const dependentDeskCount = data.preview ? 0 : Math.max(0, data.overview.desks.length - (desk ? 1 : 0));
  const selectedPerson = selectedPersonId ? people.find((person) => person.id === selectedPersonId) ?? null : null;

  return <div className="admin-page admin-shell desk-admin my-desk-admin">
    <header className="desk-heading my-desk-heading"><div><p className="status">PANEL ADMIN</p><h1>{data.deskName ?? "MESA DE MAURICIO"}</h1></div><span className="calculated-badge">{monthLabel(data.month)}</span></header>
    {data.preview ? <p className="desk-preview-notice" role="status"><span>Vista de comprobación · sin mesa asignada. Sólo se muestran tus propios datos.</span><Link href="/app/mi-mesa?demo=1">Abrir escenario ficticio</Link></p> : null}
    {data.demo ? <p className="desk-preview-notice demo" role="status"><span>Escenario ficticio · los cambios quedan sólo en esta prueba.</span><Link href="/app/mi-mesa">Volver a mis datos</Link></p> : null}
    <section className="my-desk-summary" aria-label="Resumen administrativo"><article className="my-desk-hero"><span>Ganancia del período</span><strong>{money(manager.totalIncome)}</strong><small>{money(manager.ownIncome)} propias · {money(manager.mesaIncome)} administración</small></article><article className="my-desk-summary-card"><Metric label="Ganancia histórica" value={money(historicGain)} /></article><article className="my-desk-summary-card"><Metric label="Facturación del período" value={money(structureBilling)} /></article><article className="my-desk-summary-card"><Metric label="Integrantes mesa principal" value={String(directMembers.length)} /></article><article className="my-desk-summary-card"><Metric label="Mesas dependientes" value={String(dependentDeskCount)} /></article></section>
    <section className="my-desk-structure-summary"><article className="my-desk-structure-primary"><span>Toda la estructura</span><strong>{money(structureBilling)}</strong><small>{desk?.structureMembers.length ?? 0} integrantes · {dependentDeskCount} mesas dependientes</small></article><article><Metric label="Mesa directa" value={money(directBilling)} note={`${directMembers.length} integrantes`} /></article></section>
    <section className="desk-surface"><div className="admin-section-heading"><div><p className="status">EVOLUCIÓN</p><h2>Resultados por período</h2></div></div><HistoryChart data={data.history} /></section>
    <InvitationPanel data={data} />
    <section className="desk-surface"><div className="admin-section-heading"><div><p className="status">ESTRUCTURA</p><h2>Usuarios</h2></div><span className="calculated-badge">{people.length}</span></div><div className="desk-table-scroll"><table className="desk-table my-desk-user-table"><thead><tr><th>ID</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Ganancia período</th><th>Facturación histórica</th></tr></thead><tbody>{people.map((person) => { const editable = editableByUser[person.id]; return <tr key={person.id}><td><span className="desk-user-id">{data.displayIdByUser[person.id] || "ID pendiente"}</span></td><td><button className="desk-person" onClick={() => setSelectedPersonId(person.id)} type="button">{person.name}</button></td><td>{person.id === data.userId ? "Titular" : editable?.role === "admin" ? "Admin" : "Alumno"}</td><td><span className={`desk-status ${editable?.state === "active" ? "active" : "inactive"}`}>{stateLabel(editable?.state ?? "active")}</span></td><td>{money(person.totalIncome)}</td><td>{money(data.historicalBillingByUser[person.id] ?? 0)}</td></tr>; })}</tbody></table></div></section>
    <section className="desk-surface desk-board-section"><div className="admin-section-heading"><div><p className="status">PIZARRA</p><h2>Estructura completa</h2></div></div><StructureBoard data={data} manager={manager} onOpenUser={setSelectedPersonId} rootDesk={desk} /></section>
    <section className="desk-surface desk-ranking-surface"><div className="admin-section-heading"><div><p className="status">PERÍODO ANTERIOR</p><h2>Ranking de la estructura</h2></div></div><Ranking data={data} people={people} /></section>
    {selectedPerson && editableByUser[selectedPerson.id] ? <UserDetailModal data={data} editable={editableByUser[selectedPerson.id]} onClose={() => setSelectedPersonId(null)} onSave={(next) => setEditableByUser((current) => ({ ...current, [selectedPerson.id]: next }))} person={selectedPerson} /> : null}
  </div>;
}
