"use client";

import { useEffect, useState } from "react";

import type { RutyxStrategy } from "@/modules/rutyx/domain/types";

export function RutyxEntitlementEditor({ userId }: Readonly<{ userId: string }>) {
  const [strategies, setStrategies] = useState<readonly RutyxStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/rutyx-entitlements/${userId}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { message?: string; strategies?: RutyxStrategy[] };
      if (!active) return;
      setStrategies(payload.strategies ?? []);
      setMessage(response.ok ? "" : payload.message ?? "No se pudieron cargar las rutas.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/rutyx-entitlements/${userId}`, {
      body: JSON.stringify({ enabledStrategyIds: strategies.filter((strategy) => strategy.enabled).map((strategy) => strategy.id) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json() as { message?: string; strategies?: RutyxStrategy[] };
    if (response.ok) {
      setStrategies(payload.strategies ?? strategies);
      setMessage("Rutas actualizadas.");
    } else setMessage(payload.message ?? "No se pudieron guardar las rutas.");
    setSaving(false);
  }

  return <section className="master-rutyx-editor">
    <div><h3>Rutyx</h3><small>Habilitación individual de rutas</small></div>
    {loading ? <p>Cargando rutas…</p> : <>
      <div className="master-rutyx-company"><strong>LUCID</strong>{strategies.map((strategy) => <label key={strategy.id}>
        <input checked={strategy.enabled} onChange={(event) => setStrategies((current) => current.map((item) => item.id === strategy.id ? { ...item, enabled: event.target.checked } : item))} type="checkbox" />
        <span>{strategy.name}</span>
      </label>)}</div>
      <div className="master-rutyx-company disabled"><strong>FTMO</strong><span>Próximamente</span></div>
      <div className="master-rutyx-company disabled"><strong>Tradeify</strong><span>Próximamente</span></div>
      <button className="secondary-action" disabled={saving} onClick={() => void save()} type="button">{saving ? "Guardando…" : "Guardar rutas"}</button>
    </>}
    {message ? <p className="master-rutyx-message" role="status">{message}</p> : null}
  </section>;
}
