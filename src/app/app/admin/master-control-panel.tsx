"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { MasterControlData } from "@/modules/admin/server/load-master-control";
import { saveNodalUnit } from "./unit-actions";

import "./desks.css";
import "./master-control.css";

type Person = MasterControlData["overview"]["people"][number];
type Unit = MasterControlData["units"][number];
type UnitSummary = MasterControlData["unitSummaries"][number];
type OverviewDesk = MasterControlData["overview"]["desks"][number];
type UnitDraft = Readonly<{
  code: string;
  companyName: string;
  email: string;
  id: string | null;
  nodalPercent: string;
  responsible: string;
}>;
type UnitDetails = Readonly<Pick<UnitDraft, "email" | "nodalPercent" | "responsible">>;
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

const dateLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(value))
  : "Sin fecha";

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

function buildBoardTree(data: MasterControlData, people: Person[], selectedUnitId: string): BoardNode {
  const activeDesks = data.overview.desks.filter((desk) => desk.terms.active);
  const visibleUnits = selectedUnitId === "all" ? data.units : data.units.filter((unit) => unit.id === selectedUnitId);
  const personNode = (unit: MasterControlData["units"][number], person: Person, ancestors: ReadonlySet<string>): BoardNode => {
    if (ancestors.has(person.id)) return { children: [], detail: "", id: `person-${person.id}`, label: person.name, personId: person.id, tone: "gray" };
    const managed = activeDesks.find((desk) => desk.terms.manager_id === person.id && desk.id !== unit.root_desk_id);
    const nextAncestors = new Set(ancestors).add(person.id);
    const children = managed
      ? people.filter((candidate) => candidate.deskId === managed.id && candidate.id !== person.id).map((candidate) => personNode(unit, candidate, nextAncestors))
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
  const unitNodes = visibleUnits.map((unit) => {
    const unitPeople = people.filter((person) => data.unitByUser[person.id] === unit.id);
    const mainPeople = unitPeople.filter((person) => person.deskId === unit.root_desk_id);
    const summary = data.unitSummaries.find((candidate) => candidate.id === unit.id);
    return {
      children: mainPeople.map((person) => personNode(unit, person, new Set())),
      detail: `${summary?.userCount ?? unitPeople.length} usuarios · ${summary?.deskCount ?? 0} mesas · ${money(summary?.gross ?? 0)}`,
      id: `unit-${unit.id}`,
      label: `${String(unit.ordinal).padStart(2, "0")} · ${unit.name}`,
      tone: "lime" as const,
    };
  });
  return {
    children: unitNodes,
    detail: `${unitNodes.length} ${unitNodes.length === 1 ? "unidad operativa" : "unidades operativas"}`,
    id: "system-nodal",
    label: "SISTEMA NODAL",
    tone: "lime",
  };
}

function layoutBoard(root: BoardNode) {
  const nodeWidth = 166;
  const horizontalGap = 38;
  const verticalGap = 174;
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

function SystemBoard({ data, onOpenUser, people, selectedUnitId }: Readonly<{ data: MasterControlData; onOpenUser: (id: string) => void; people: Person[]; selectedUnitId: string }>) {
  const tree = useMemo(() => buildBoardTree(data, people, selectedUnitId), [data, people, selectedUnitId]);
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
      {layout.nodes.map((node) => {
        const person = node.personId ? people.find((candidate) => candidate.id === node.personId) : null;
        const profile = node.personId ? data.profilesByUser[node.personId] : null;
        const identities = node.personId ? (data.identitiesByUser[node.personId] ?? []) : [];
        const activeIdentities = identities.filter((identity) => identity.state.toLowerCase() === "activa").length;
        const managedDesk = node.personId
          ? data.overview.desks.find((desk) => desk.terms.active && desk.terms.manager_id === node.personId)
          : null;
        const connector = node.personId ? data.connectorByUser[node.personId] : null;
        const isExpanded = expanded.has(node.id);
        return <article className={`desk-board-node ${node.tone} ${isExpanded ? "expanded" : ""}`} key={node.id} style={{ left: node.x, top: node.y }}>
          {node.personId ? <button className="desk-board-node-name" onClick={() => onOpenUser(node.personId!)} type="button">{node.label}</button> : <strong>{node.label}</strong>}
          <button aria-expanded={isExpanded} aria-label={`${isExpanded ? "Ocultar" : "Mostrar"} información de ${node.label}`} className="desk-board-node-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })} type="button">{isExpanded ? "−" : "+"}</button>
          {isExpanded && person ? <small className="desk-board-person-detail">
            <span>ID: {data.identifiersByUser[person.id] ?? "Pendiente"}</span>
            <span>Alta: {dateLabel(profile?.created_at)}</span>
            <span>% op. propias: {(person.terms?.commission_bps ?? 0) / 100}%</span>
            {managedDesk ? <span>% Admin mesa: {managedDesk.terms.nodal_bps / 100}%</span> : null}
            <span>Identidades: {profile?.identities_enabled ? "habilitadas" : "no habilitadas"} · {activeIdentities}/{identities.length}</span>
            <span>Ninja: {connector?.active ? "Activo" : "Desactivado"}{connector?.version ? ` · v${connector.version}` : " · sin versión"}</span>
          </small> : isExpanded ? <small>{node.detail}</small> : null}
        </article>;
      })}
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
    <div className="desk-user-fields"><label>Estado<input disabled value={person.access === "active" ? "Activo" : "Revocado"} /></label><label>Email de acceso<input disabled value={profile?.email ?? person.email} /></label><label>Email de contacto<input disabled value={profile?.contact_email ?? profile?.email ?? person.email} /></label><label>Rol<input disabled value={managedDesk ? "Admin" : profile?.access_role === "admin" ? "Admin Master" : "Usuario"} /></label></div>
    <section className="desk-agreement-block"><h3>Acuerdo % NODAL</h3><label>Operaciones propias<div><input disabled value={(person.terms?.commission_bps ?? 0) / 100} /><span>%</span></div></label>{managedDesk ? <label>Admin mesa<div><input disabled value={managedDesk.terms.nodal_bps / 100} /><span>%</span></div></label> : null}<small>Admin Master puede modificar estos valores desde la gestión administrativa.</small></section>
    <div className="desk-user-switches"><article className="desk-ninja-state"><span>Conexión Ninja<small>Última transmisión: {dateTimeLabel(connector?.lastSeenAt)}</small></span><div><strong className={connector?.active ? "active" : "inactive"}>{connector?.active ? "Activo" : "Desactivado"}</strong><small>{connector?.version ? `Conector v${connector.version}` : "Sin versión registrada"}</small></div></article><article><span>Identidades<small>Administradas por el titular</small></span><strong>{profile?.identities_enabled ? "Habilitadas" : "No habilitadas"}</strong></article></div>
    {identities.length ? <div className="desk-identities-table"><table><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th></tr></thead><tbody>{identities.map((identity) => <tr key={identity.id}><td>{identity.id.slice(0, 8)}</td><td>{identity.name}</td><td>{identity.state}</td></tr>)}</tbody></table></div> : null}
    <footer><button className="secondary-action" onClick={onClose} type="button">Cerrar</button>{data.demo ? <button className="primary-action" disabled type="button">Registros simulados</button> : <Link className="primary-action" href={`/app/admin/${person.id}`}>Ver registros del usuario</Link>}</footer>
  </section></div>;
}

function UnitEditorModal({ demo, draft, existingUnits, onClose, onSave }: Readonly<{
  demo: boolean;
  draft: UnitDraft;
  existingUnits: Unit[];
  onClose: () => void;
  onSave: (draft: UnitDraft) => Promise<string | null> | string | null | void;
}>) {
  const [code, setCode] = useState(draft.code);
  const [companyName, setCompanyName] = useState(draft.companyName);
  const [email, setEmail] = useState(draft.email);
  const [nodalPercent, setNodalPercent] = useState(draft.nodalPercent);
  const [responsible, setResponsible] = useState(draft.responsible);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const save = async () => {
    const normalizedCode = code.trim().toUpperCase();
    const numericPercent = Number(nodalPercent.replace(",", "."));
    if (!companyName.trim() || !responsible.trim() || !email.trim() || !nodalPercent.trim()) { setError("Completá todos los datos de la unidad."); return; }
    if (!/^[A-Z]{2}$/.test(normalizedCode)) { setError("La abreviación debe tener exactamente dos letras."); return; }
    if (existingUnits.some((unit) => unit.code === normalizedCode && unit.id !== draft.id)) { setError("Esa abreviación ya pertenece a otra unidad."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Ingresá un e-mail válido para la persona responsable."); return; }
    if (!Number.isFinite(numericPercent) || numericPercent < 0 || numericPercent > 100) { setError("El acuerdo NODAL debe ser un porcentaje entre 0 y 100."); return; }
    setSaving(true);
    const message = await onSave({ code: normalizedCode, companyName: companyName.trim(), email: email.trim(), id: draft.id, nodalPercent: String(numericPercent), responsible: responsible.trim() });
    setSaving(false);
    if (message) setError(message);
  };
  return <div aria-modal="true" className="desk-modal-backdrop" role="dialog" onMouseDown={onClose}><section className="desk-user-modal master-unit-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span>SISTEMA NODAL</span><h2>{draft.id ? "Editar unidad" : "Registrar unidad"}</h2></div><button className="desk-modal-close" onClick={onClose} type="button">×</button></header>
    <p className="master-unit-explanation">{draft.id ? "Actualizá la información general y el acuerdo de la unidad." : "Completá los datos definidos para dar de alta una nueva unidad."}</p>
    <div className="desk-user-fields master-unit-fields">
      <label>Nombre de empresa<input autoFocus onChange={(event) => setCompanyName(event.target.value)} placeholder="Highway Trading" value={companyName} /></label>
      <label>Abreviatura<input maxLength={2} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="HW" value={code} /></label>
      <label>Responsable<input onChange={(event) => setResponsible(event.target.value)} placeholder="Nombre y apellido" value={responsible} /></label>
      <label>E-mail<input inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="responsable@empresa.com" type="email" value={email} /></label>
      <label>% Acuerdo NODAL<div className="master-unit-percent"><input inputMode="decimal" max="100" min="0" onChange={(event) => setNodalPercent(event.target.value)} placeholder="25" type="number" value={nodalPercent} /><span>%</span></div></label>
    </div>
    {error ? <p className="master-unit-error" role="alert">{error}</p> : null}
    <small className="master-unit-local-note">{demo ? "Comprobación visual: este cambio existe sólo en el escenario ficticio." : "El cambio se guarda con permisos de Admin Master y trazabilidad."}</small>
    <footer><button className="secondary-action" disabled={saving} onClick={onClose} type="button">Cancelar</button><button className="primary-action" disabled={saving} onClick={save} type="button">{saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Dar de alta"}</button></footer>
  </section></div>;
}

export function MasterControlPanel({ data, demoAvailable = false, view = "control" }: Readonly<{ data: MasterControlData; demoAvailable?: boolean; view?: "control" | "statistics" }>) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedDeskId, setSelectedDeskId] = useState("all");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [unitDraft, setUnitDraft] = useState<UnitDraft | null>(null);
  const [demoUnits, setDemoUnits] = useState<Unit[]>([...data.units]);
  const [demoUnitSummaries, setDemoUnitSummaries] = useState<UnitSummary[]>([...data.unitSummaries]);
  const [demoDesks, setDemoDesks] = useState<OverviewDesk[]>([...data.overview.desks]);
  const [demoUnitByDesk, setDemoUnitByDesk] = useState<Record<string, string>>({ ...data.unitByDesk });
  const [demoIdentifiers, setDemoIdentifiers] = useState<Record<string, string>>({ ...data.identifiersByUser });
  const [demoUnitDetails, setDemoUnitDetails] = useState<Record<string, UnitDetails>>(() => Object.fromEntries(data.units.map((unit) => {
    const rootDesk = data.overview.desks.find((desk) => desk.id === unit.root_desk_id);
    const responsible = data.overview.people.find((person) => person.deskId === unit.root_desk_id);
    return [unit.id, {
      email: unit.responsible_email ?? responsible?.email ?? "responsable@nodal.test",
      nodalPercent: String((unit.agreement_bps ?? rootDesk?.terms.nodal_bps ?? 0) / 100),
      responsible: unit.responsible_name ?? responsible?.name ?? "Responsable pendiente",
    }];
  })));
  const displayData = useMemo<MasterControlData>(() => data.demo ? {
    ...data,
    identifiersByUser: demoIdentifiers,
    overview: { ...data.overview, desks: demoDesks },
    unitByDesk: demoUnitByDesk,
    unitSummaries: demoUnitSummaries,
    units: demoUnits,
  } : data, [data, demoDesks, demoIdentifiers, demoUnitByDesk, demoUnitSummaries, demoUnits]);
  const activePeople = useMemo(() => displayData.overview.people.filter((person) => person.access === "active"), [displayData.overview.people]);
  const unitDesks = useMemo(() => displayData.overview.desks.filter((desk) => desk.terms.active && (selectedUnitId === "all" || displayData.unitByDesk[desk.id] === selectedUnitId)), [displayData.overview.desks, displayData.unitByDesk, selectedUnitId]);
  const scopedPeople = useMemo(() => activePeople.filter((person) =>
    (selectedUnitId === "all" || displayData.unitByUser[person.id] === selectedUnitId)
    && (selectedDeskId === "all" || person.deskId === selectedDeskId)
  ), [activePeople, displayData.unitByUser, selectedDeskId, selectedUnitId]);
  const visiblePeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scopedPeople;
    return scopedPeople.filter((person) => `${person.name} ${person.email} ${displayData.identifiersByUser[person.id] ?? ""}`.toLowerCase().includes(normalized));
  }, [displayData.identifiersByUser, query, scopedPeople]);
  const visibleUnitSummaries = displayData.unitSummaries.filter((summary) => selectedUnitId === "all" || summary.id === selectedUnitId);
  const selected = activePeople.find((person) => person.id === selectedPersonId) ?? null;
  const historicNodal = displayData.performanceHistory.reduce((sum, point) => sum + point.nodalIncome, 0);
  const historicGross = displayData.performanceHistory.reduce((sum, point) => sum + point.gross, 0);
  const changePeriod = (period: string) => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (data.demo) params.set("demo", "1");
    router.push(`${view === "statistics" ? "/app/admin/statistics" : "/app/admin"}?${params.toString()}`);
  };
  const editUnit = (unit: Unit) => {
    const details = demoUnitDetails[unit.id];
    setUnitDraft({
      code: unit.code,
      companyName: unit.name.replace(/^Unidad\s+/i, ""),
      email: details?.email ?? "",
      id: unit.id,
      nodalPercent: details?.nodalPercent ?? "",
      responsible: details?.responsible ?? "",
    });
  };
  const saveUnit = (draft: UnitDraft) => {
    const plainCompanyName = draft.companyName.replace(/^Unidad\s+/i, "").trim();
    const unitName = `Unidad ${plainCompanyName}`;
    const rootDeskName = `Mesa principal ${plainCompanyName}`;
    const nodalBps = Math.round(Number(draft.nodalPercent) * 100);
    if (draft.id) {
      const previous = demoUnits.find((unit) => unit.id === draft.id);
      if (!previous) return;
      setDemoUnits((current) => current.map((unit) => unit.id === draft.id ? {
        ...unit,
        agreement_bps: nodalBps,
        code: draft.code,
        name: unitName,
        responsible_email: draft.email,
        responsible_name: draft.responsible,
      } : unit));
      setDemoDesks((current) => current.map((desk) => desk.id === previous.root_desk_id ? { ...desk, name: rootDeskName, terms: { ...desk.terms, nodal_bps: nodalBps } } : desk));
      setDemoUnitDetails((current) => ({ ...current, [draft.id!]: { email: draft.email, nodalPercent: draft.nodalPercent, responsible: draft.responsible } }));
      if (previous.code !== draft.code) {
        setDemoIdentifiers((current) => Object.fromEntries(Object.entries(current).map(([userId, identifier]) => [
          userId,
          displayData.unitByUser[userId] === draft.id ? identifier.replace(/^USER[A-Z]{2}-/, `USER${draft.code}-`) : identifier,
        ])));
      }
      setUnitDraft(null);
      return;
    }
    const token = crypto.randomUUID();
    const unitId = `demo-unit-${token}`;
    const rootDeskId = `demo-root-${token}`;
    const ordinal = demoUnits.reduce((maximum, unit) => Math.max(maximum, unit.ordinal), 0) + 1;
    const unit: Unit = {
      agreement_bps: nodalBps,
      code: draft.code,
      id: unitId,
      name: unitName,
      ordinal,
      responsible_email: draft.email,
      responsible_name: draft.responsible,
      root_desk_id: rootDeskId,
    };
    const rootDesk: OverviewDesk = {
      children: [],
      created_at: new Date().toISOString(),
      directGenerated: 0,
      generated: 0,
      gross: 0,
      id: rootDeskId,
      managerShare: 0,
      members: [],
      name: rootDeskName,
      nodalShare: 0,
      parent_id: null,
      structureGross: 0,
      structureMembers: [],
      terms: { active: true, desk_id: rootDeskId, effective_month: displayData.month, manager_id: null, nodal_bps: nodalBps },
    };
    setDemoUnits((current) => [...current, unit]);
    setDemoUnitSummaries((current) => [...current, { deskCount: 1, gross: 0, id: unitId, nodalIncome: 0, userCount: 0 }]);
    setDemoDesks((current) => [...current, rootDesk]);
    setDemoUnitByDesk((current) => ({ ...current, [rootDeskId]: unitId }));
    setDemoUnitDetails((current) => ({ ...current, [unitId]: { email: draft.email, nodalPercent: draft.nodalPercent, responsible: draft.responsible } }));
    setSelectedUnitId(unitId);
    setSelectedDeskId("all");
    setUnitDraft(null);
  };
  const persistUnit = async (draft: UnitDraft) => {
    const result = await saveNodalUnit(draft);
    if (!result.ok) return result.message;
    setUnitDraft(null);
    router.refresh();
    return null;
  };
  return <div className="admin-page admin-shell master-control">
    <header className="desk-heading master-heading"><div><p className="status">ADMIN MASTER</p><h1>{view === "statistics" ? "Estadísticas" : "Panel control"}</h1></div></header>
    {data.demo ? <p className="master-demo-notice" role="status"><span><strong>Escenario ficticio</strong> · permite comprobar jerarquías, filtros y fichas sin modificar datos reales.</span><Link href="/app/admin">Volver a datos reales</Link></p> : demoAvailable ? <p className="master-demo-notice available"><span>Comprobación de diseño disponible sólo para tu cuenta.</span><Link href="/app/admin?demo=1">Abrir escenario ficticio</Link></p> : null}
    {data.demo && view === "control" ? <section className="master-demo-alerts" id="demo-alerts"><article><span>4</span><div><strong>Solicitudes de apertura</strong><small>Distribuidas entre NODAL, Highway y Atlas.</small></div></article><article><span>2</span><div><strong>Alertas de conector</strong><small>Usuarios sin transmitir durante más de 24 horas.</small></div></article><small>Contenido simulado: estos avisos no corresponden a usuarios reales.</small></section> : null}
    {!data.demo && view === "control" && displayData.pendingAccessRequests.length > 0 ? <section className="master-live-requests" aria-labelledby="pending-access-title">
      <div className="master-live-requests-heading"><div><p className="status">APROBACIÓN ADMIN MASTER</p><h2 id="pending-access-title">Solicitudes de apertura</h2><small>Estas personas solicitaron ingresar y todavía no fueron aprobadas.</small></div><span className="calculated-badge">{displayData.pendingAccessRequests.length}</span></div>
      <div className="master-live-request-list">{displayData.pendingAccessRequests.map((request) => <article key={request.id}><div><strong>{request.name}</strong><span>{request.email}</span></div><small>{dateTimeLabel(request.createdAt)}</small></article>)}</div>
      <Link className="primary-action master-live-requests-action" href="/app/admin/users">Revisar y aprobar solicitudes</Link>
    </section> : null}
    <section className="master-kpis"><Metric label="Ganancia NODAL del período" value={money(displayData.overview.nodalIncome)} /><Metric label="Ganancia NODAL histórica" value={money(historicNodal)} /><Metric label="Facturación total del período" value={money(displayData.overview.gross)} /><Metric label="Facturación histórica" value={money(historicGross)} /><Metric label="Unidades operativas" value={String(displayData.units.length)} /><Metric label="Usuarios activos" value={String(activePeople.length)} /></section>
    <section className="master-dashboard-grid"><article className="desk-surface"><div className="admin-section-heading"><div><h2>Desempeño del sistema</h2></div></div><SystemChart history={displayData.performanceHistory} /></article><article className="desk-surface"><div className="admin-section-heading"><div><h2>{selectedUnitId === "all" ? "Ranking NODAL" : "Ranking de la unidad"}</h2></div></div><Ranking people={scopedPeople} /></article></section>
    <section aria-label="Filtros del sistema" className="master-filters"><label>Unidad<select value={selectedUnitId} onChange={(event) => { setSelectedUnitId(event.target.value); setSelectedDeskId("all"); }}><option value="all">Todas las unidades</option>{displayData.units.map((unit) => <option key={unit.id} value={unit.id}>{String(unit.ordinal).padStart(2, "0")} · {unit.name}</option>)}</select></label><label>Mesa<select value={selectedDeskId} onChange={(event) => setSelectedDeskId(event.target.value)}><option value="all">Todas las mesas</option>{unitDesks.map((desk) => <option key={desk.id} value={desk.id}>{desk.name}</option>)}</select></label><label>ID o nombre de usuario<input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario" value={query} /></label><label>Período<select onChange={(event) => changePeriod(event.target.value)} value={displayData.month}>{displayData.periods.map((period) => <option key={period} value={period}>{monthLabel(period)}</option>)}</select></label></section>
    {view === "control" ? <><div className="master-unit-heading"><div><h2>Unidades del sistema</h2><small>{data.demo ? "Los cambios de esta prueba son locales y temporales." : "Estructura registrada del Sistema NODAL."}</small></div><button className="primary-action" onClick={() => setUnitDraft({ code: "", companyName: "", email: "", id: null, nodalPercent: "", responsible: "" })} type="button">+ Agregar unidad</button></div><section className="master-unit-grid">{visibleUnitSummaries.map((summary) => { const unit = displayData.units.find((candidate) => candidate.id === summary.id)!; return <article className={`master-unit-card ${selectedUnitId === unit.id ? "selected" : ""}`} key={unit.id}><button aria-pressed={selectedUnitId === unit.id} className="master-unit-select" onClick={() => { setSelectedUnitId(unit.id); setSelectedDeskId("all"); }} type="button"><div className="master-unit-identity"><span>{String(unit.ordinal).padStart(2, "0")}</span><div><p>UNIDAD</p><h2>{unit.name}</h2><small>{unit.code}</small></div></div><dl><div><dt>Facturación período</dt><dd>{money(summary.gross)}</dd></div><div><dt>Ganancia NODAL</dt><dd>{money(summary.nodalIncome)}</dd></div><div><dt>Mesas</dt><dd>{summary.deskCount}</dd></div><div><dt>Usuarios</dt><dd>{summary.userCount}</dd></div></dl></button><button className="master-unit-edit" onClick={() => editUnit(unit)} type="button">Editar</button></article>; })}</section></> : null}
    <section className="desk-surface"><div className="admin-section-heading"><div><h2>{selectedUnitId === "all" ? "Usuarios del sistema" : "Usuarios de la unidad"}</h2></div><span className="calculated-badge">{visiblePeople.length}</span></div><div className="desk-table-scroll"><table className="desk-table"><thead><tr><th>ID</th><th>Nombre</th><th>Unidad</th><th>Rol</th><th>Estado</th><th>Ganancia período</th><th>Facturación histórica</th></tr></thead><tbody>{visiblePeople.map((person) => { const managed = displayData.overview.desks.some((desk) => desk.terms.active && desk.terms.manager_id === person.id); const master = displayData.profilesByUser[person.id]?.access_role === "admin"; const unit = displayData.units.find((candidate) => candidate.id === displayData.unitByUser[person.id]); return <tr key={person.id}><td><span className="desk-user-id">{displayData.identifiersByUser[person.id] ?? "ID pendiente"}</span></td><td><button className="desk-person" onClick={() => setSelectedPersonId(person.id)} type="button">{person.name}</button></td><td>{unit?.code ?? "—"}</td><td>{managed ? "Admin" : master ? "Admin Master" : "Usuario"}</td><td><span className="desk-status active">Activo</span></td><td>{money(person.gross)}</td><td>{money(displayData.historicalGrossByUser[person.id] ?? 0)}</td></tr>; })}</tbody></table>{!visiblePeople.length ? <p className="desk-empty">No hay coincidencias.</p> : null}</div></section>
    {view === "control" ? <section className="desk-surface desk-board-section"><div className="admin-section-heading"><div><h2>Sistema NODAL</h2></div></div><SystemBoard data={displayData} onOpenUser={setSelectedPersonId} people={scopedPeople} selectedUnitId={selectedUnitId} /></section> : null}
    {selected ? <MasterUserModal data={displayData} onClose={() => setSelectedPersonId(null)} person={selected} /> : null}
    {unitDraft ? <UnitEditorModal demo={data.demo} draft={unitDraft} existingUnits={displayData.units} onClose={() => setUnitDraft(null)} onSave={data.demo ? saveUnit : persistUnit} /> : null}
  </div>;
}
