"use client";

import { useState } from "react";

import { revokeNinjaConnector } from "./ninja-connector-actions";
import { NinjaConnectorMonitor } from "./ninja-connector-monitor";

export type NinjaConnectorStatus = Readonly<{
  connectorId: string;
  connectorVersion: string;
  installedSourceVersion: string | null;
  identityId: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  pairedAt: string;
  status: string;
}>;

type Props = Readonly<{
  allowRevoke?: boolean;
  compact?: boolean;
  connector: NinjaConnectorStatus | null;
  downloadLabel?: string;
  monitor?: boolean;
  targetIdentityId?: string | null;
}>;

function isOnline(connector: NinjaConnectorStatus | null) {
  return Boolean(connector?.isOnline && connector.status === "active");
}

export function NinjaConnectorPanel({ allowRevoke = true, compact = false, connector, downloadLabel, monitor = false, targetIdentityId = null }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = isOnline(connector);

  async function downloadInstaller() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch("/api/downloads/ninja-connector", {
        body: JSON.stringify({ identityId: targetIdentityId }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "NODAL-Conector.exe";
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch {
      setError("No se pudo preparar el instalador. Intentá nuevamente.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={`ninja-pairing-panel${compact ? " is-compact" : ""}`} aria-labelledby="ninja-pairing-title">
      {monitor ? <NinjaConnectorMonitor linked={connector?.status === "active"} online={online} /> : null}
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
          Descargá el instalador y ejecutalo con NinjaTrader cerrado. La vinculación se realiza automáticamente.
        </p>
      ) : null}

      <button
        className={compact && connector ? "secondary-action" : "primary-action"}
        disabled={downloading}
        onClick={downloadInstaller}
        type="button"
      >
        {downloading ? "Preparando…" : downloadLabel ?? (connector ? "Actualizar conector" : "Descargar instalador")}
      </button>

      {error ? <p className="purchase-message error" role="alert">{error}</p> : null}
      {connector && allowRevoke ? (
        <form action={revokeNinjaConnector} className="ninja-revoke-form">
          <input name="connector_id" type="hidden" value={connector.connectorId} />
          <button className="secondary-action" type="submit">Desvincular</button>
        </form>
      ) : null}
    </section>
  );
}
