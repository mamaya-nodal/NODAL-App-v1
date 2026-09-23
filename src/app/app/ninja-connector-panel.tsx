"use client";

import { useActionState, useState } from "react";

import { createNinjaPairingCode, revokeNinjaConnector, type PairingCodeState } from "./ninja-connector-actions";
import { NinjaConnectorMonitor } from "./ninja-connector-monitor";

export type NinjaConnectorStatus = Readonly<{
  connectorId: string;
  connectorVersion: string;
  identityId: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  pairedAt: string;
  status: string;
}>;

type Props = Readonly<{
  compact?: boolean;
  connector: NinjaConnectorStatus | null;
  targetIdentityId?: string | null;
}>;
const initialState: PairingCodeState = {};

function isOnline(connector: NinjaConnectorStatus | null) {
  return Boolean(connector?.isOnline && connector.status === "active");
}

export function NinjaConnectorPanel({ compact = false, connector, targetIdentityId = null }: Props) {
  const pairingAction = createNinjaPairingCode.bind(null, targetIdentityId);
  const [state, action, pending] = useActionState(pairingAction, initialState);
  const [copied, setCopied] = useState(false);
  const online = isOnline(connector);

  async function copyCode() {
    if (!state.code) return;
    await navigator.clipboard.writeText(state.code);
    setCopied(true);
  }

  return (
    <section className={`ninja-pairing-panel${compact ? " is-compact" : ""}`} aria-labelledby="ninja-pairing-title">
      <NinjaConnectorMonitor linked={connector?.status === "active"} online={online} />
      <div className={`ninja-detections-heading${compact ? " visually-compact" : ""}`}>
        <div>
          <p className="status">CONEXIÓN CON NINJATRADER</p>
          <h3 id="ninja-pairing-title">Conector NODAL</h3>
        </div>
        <span className={`ninja-live-badge ${online ? "is-online" : "is-offline"}`}>
          {online ? "Conector activo" : connector ? "Conector sin señal" : "Sin vincular"}
        </span>
      </div>

      {!compact && connector ? (
        <p className="notice">
          Vinculado con NODAL. Cerrar sesión en esta web no interrumpe el envío desde NinjaTrader.
          {connector.lastSeenAt ? ` Última señal: ${new Date(connector.lastSeenAt).toLocaleString("es-AR")}.` : " Todavía no se recibió la primera señal."}
        </p>
      ) : !compact ? (
        <p className="notice">
          Generá un código temporal y colocalo en el conector para vincular NinjaTrader con tu usuario.
        </p>
      ) : null}

      <form action={action}>
        <button className={compact && connector ? "secondary-action" : "primary-action"} disabled={pending} type="submit">
          {pending ? "Generando…" : connector ? compact ? "Reinstalar o cambiar vínculo" : "Generar un vínculo nuevo" : compact ? "Vincular NinjaTrader" : "Generar código de vinculación"}
        </button>
      </form>

      {state.code ? (
        <div className="ninja-pairing-code" role="status">
          <div><small>Pegalo en el instalador · válido 5 minutos</small><strong>{state.code}</strong></div>
          <button className="secondary-action" onClick={copyCode} type="button">{copied ? "Copiado" : "Copiar código"}</button>
        </div>
      ) : null}
      {state.error ? <p className="purchase-message error" role="alert">{state.error}</p> : null}
      {connector ? (
        <form action={revokeNinjaConnector} className="ninja-revoke-form">
          <input name="connector_id" type="hidden" value={connector.connectorId} />
          <button className="secondary-action" type="submit">Desvincular</button>
        </form>
      ) : null}
    </section>
  );
}
