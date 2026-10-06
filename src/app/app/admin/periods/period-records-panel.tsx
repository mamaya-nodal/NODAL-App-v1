"use client";

import { useActionState, useMemo, useState } from "react";

import type { PeriodCloseControlData } from "@/modules/accounting/server/load-period-close-control";
import type { MasterControlData } from "@/modules/admin/server/load-master-control";
import { approveSelectedAccountingClosures, type ClosureActionResult } from "./actions";
import { PeriodClosePanel } from "./period-close-panel";
import "../desks.css";
import "./periods.css";

const initial: ClosureActionResult = { message: "", ok: false };

type Person = MasterControlData["overview"]["people"][number];

function csvValue(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function PeriodRecordsPanel({ closeData, masterData }: Readonly<{
  closeData: PeriodCloseControlData;
  masterData: MasterControlData;
}>) {
  const [selectedUnitId, setSelectedUnitId] = useState(masterData.units[0]?.id ?? "");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [localMessage, setLocalMessage] = useState("");
  const [result, action, pending] = useActionState(approveSelectedAccountingClosures, initial);
  const year = useMemo(() => {
    const latest = [...closeData.closedPeriods, ...closeData.openPeriods]
      .map((period) => period.month.slice(0, 4))
      .sort()
      .at(-1);
    return latest ?? String(new Date().getFullYear());
  }, [closeData.closedPeriods, closeData.openPeriods]);
  const selectedUnit = masterData.units.find((unit) => unit.id === selectedUnitId) ?? masterData.units[0];
  const people = useMemo(() => masterData.overview.people.filter((person) =>
    person.access === "active" && masterData.unitByUser[person.id] === selectedUnitId
  ), [masterData, selectedUnitId]);
  const periodsByUser = useMemo(() => {
    const entries = new Map<string, PeriodCloseControlData["closedPeriods"]>();
    for (const period of closeData.closedPeriods) {
      if (!period.ownerUserId || !period.month.startsWith(year)) continue;
      entries.set(period.ownerUserId, [...(entries.get(period.ownerUserId) ?? []), period]);
    }
    return entries;
  }, [closeData.closedPeriods, year]);
  const selectedPeriods = useMemo(() => [...selectedUsers].flatMap((userId) =>
    (periodsByUser.get(userId) ?? []).filter((period) => !period.approval)
  ), [periodsByUser, selectedUsers]);

  function selectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setSelectedUsers(new Set());
    setLocalMessage("");
  }

  function toggleUser(userId: string) {
    setSelectedUsers((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setLocalMessage("");
  }

  function selectAllPending() {
    const pendingUsers = people.filter((person) => (periodsByUser.get(person.id) ?? []).some((period) => !period.approval));
    setSelectedUsers(new Set(pendingUsers.map((person) => person.id)));
    setLocalMessage(pendingUsers.length
      ? `Se seleccionaron ${pendingUsers.length} usuarios con registros pendientes.`
      : `No hay registros pendientes en ${selectedUnit?.name ?? "esta unidad"}.`);
  }

  function downloadRecords() {
    const selectedPeople = people.filter((person) => selectedUsers.has(person.id));
    if (!selectedPeople.length) {
      setLocalMessage("Seleccioná al menos un usuario para descargar sus registros.");
      return;
    }
    const rows = selectedPeople.flatMap((person) => {
      const identifier = masterData.identifiersByUser[person.id] ?? "ID pendiente";
      const periods = periodsByUser.get(person.id) ?? [];
      return periods.length ? periods.map((period) => [
        identifier,
        person.name,
        selectedUnit?.name ?? "",
        period.month,
        period.closureStatus ?? "",
        period.approval ? "Aprobado" : "Pendiente",
      ]) : [[identifier, person.name, selectedUnit?.name ?? "", "", "Sin cierre", "Sin registro"]];
    });
    const csv = [
      ["ID NODAL", "Usuario", "Unidad", "Período", "Estado del cierre", "Aprobación"],
      ...rows,
    ].map((row) => row.map(csvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `registros-${selectedUnit?.code?.toLowerCase() ?? "nodal"}-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setLocalMessage(`Se descargaron los registros seleccionados de ${selectedUnit?.name ?? "la unidad"}.`);
  }

  return <div className="admin-page admin-shell records-demo-page records-production-page">
    <header className="desk-heading records-demo-heading"><div><p className="status">ADMIN MASTER</p><h1>Registros</h1></div><strong>{year}</strong></header>

    <form action={action} className="records-demo-card">
      <div className="records-demo-toolbar">
        <label>Unidad<select onChange={(event) => selectUnit(event.target.value)} value={selectedUnitId}>{masterData.units.map((unit) => <option key={unit.id} value={unit.id}>{String(unit.ordinal).padStart(2, "0")} · {unit.name}</option>)}</select></label>
        <div className="records-demo-actions">
          <button className="secondary-action" onClick={downloadRecords} type="button">Descargar registros</button>
          <button className="primary-action" onClick={selectAllPending} type="button">Aprobar todos los registros</button>
        </div>
      </div>

      <div className="records-demo-list">
        {people.map((person: Person) => {
          const checked = selectedUsers.has(person.id);
          const periods = periodsByUser.get(person.id) ?? [];
          const pendingCount = periods.filter((period) => !period.approval).length;
          return <label className={checked ? "selected" : ""} key={person.id}>
            <span><strong>{masterData.identifiersByUser[person.id] ?? "ID pendiente"}</strong><small>{person.name}</small><small>{pendingCount ? `${pendingCount} registro${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}` : periods.length ? "Registros aprobados" : "Sin cierres en el año"}</small></span>
            <input aria-label={`Seleccionar registros de ${person.name}`} checked={checked} onChange={() => toggleUser(person.id)} type="checkbox" />
          </label>;
        })}
        {!people.length ? <p className="desk-empty">Esta unidad todavía no tiene usuarios activos.</p> : null}
      </div>

      {selectedPeriods.map((period) => <input key={period.periodId} name="period_id" type="hidden" value={period.periodId} />)}
      <footer>
        <span>{selectedUsers.size} de {people.length} seleccionados · {selectedPeriods.length} cierres pendientes</span>
        <button className="primary-action" disabled={pending || selectedPeriods.length === 0} type="submit">{pending ? "Procesando…" : "Enviar registros"}</button>
      </footer>
      {localMessage ? <p className="records-demo-message" role="status">{localMessage}</p> : null}
      {result.message ? <p className={result.ok ? "close-action-success records-action-result" : "close-action-error records-action-result"} role="status">{result.message}</p> : null}
    </form>

    <details className="records-close-control">
      <summary>Control detallado de cierres, observaciones e informes</summary>
      <PeriodClosePanel data={closeData} embedded />
    </details>
  </div>;
}
