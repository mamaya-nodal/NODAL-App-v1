"use client";

import { useMemo, useState } from "react";

import type { MasterControlData } from "@/modules/admin/server/load-master-control";
import "../desks.css";
import "./periods.css";

export function PeriodRecordsDemo({ data }: Readonly<{ data: MasterControlData }>) {
  const [selectedUnitId, setSelectedUnitId] = useState(data.units[0]?.id ?? "");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const selectedUnit = data.units.find((unit) => unit.id === selectedUnitId) ?? data.units[0];
  const people = useMemo(() => data.overview.people.filter((person) => data.unitByUser[person.id] === selectedUnitId), [data, selectedUnitId]);

  function selectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setSelectedUsers(new Set());
    setMessage("");
  }

  function toggleUser(userId: string) {
    setSelectedUsers((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setMessage("");
  }

  function approveAll() {
    setSelectedUsers(new Set(people.map((person) => person.id)));
    setMessage(`Se seleccionaron los ${people.length} registros ficticios de ${selectedUnit?.name ?? "la unidad"}.`);
  }

  function simulate(action: "download" | "send") {
    if (action === "download") {
      setMessage(`Descarga simulada de los registros de ${selectedUnit?.name ?? "la unidad"}.`);
      return;
    }
    setMessage(selectedUsers.size
      ? `${selectedUsers.size} registros ficticios listos para enviar.`
      : "Seleccioná al menos un registro antes de simular el envío.");
  }

  return <div className="admin-page admin-shell records-demo-page">
    <header className="desk-heading records-demo-heading"><div><p className="status">ADMIN MASTER</p><h1>Registros</h1></div><strong>2026</strong></header>

    <p className="master-demo-notice" role="status"><span><strong>Escenario ficticio</strong> · permite comprobar el registro por unidad sin modificar cierres reales.</span></p>

    <section className="records-demo-card">
      <div className="records-demo-toolbar">
        <label>Unidad<select onChange={(event) => selectUnit(event.target.value)} value={selectedUnitId}>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{String(unit.ordinal).padStart(2, "0")} · {unit.name}</option>)}</select></label>
        <div className="records-demo-actions">
          <button className="secondary-action" onClick={() => simulate("download")} type="button">Descargar registros</button>
          <button className="primary-action" onClick={approveAll} type="button">Aprobar todos los registros</button>
        </div>
      </div>

      <div className="records-demo-list">
        {people.map((person) => {
          const checked = selectedUsers.has(person.id);
          return <label className={checked ? "selected" : ""} key={person.id}>
            <span><strong>{data.identifiersByUser[person.id] ?? "ID pendiente"}</strong><small>{person.name}</small></span>
            <input aria-label={`Seleccionar registro de ${person.name}`} checked={checked} onChange={() => toggleUser(person.id)} type="checkbox" />
          </label>;
        })}
      </div>

      <footer>
        <span>{selectedUsers.size} de {people.length} seleccionados</span>
        <button className="primary-action" onClick={() => simulate("send")} type="button">Enviar registros</button>
      </footer>
      {message ? <p className="records-demo-message" role="status">{message}</p> : null}
    </section>
  </div>;
}
