"use client";

import { useState, useSyncExternalStore } from "react";

import { MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

import { hasDownloadedCurrentMimical, subscribeToMimicalDownload } from "./mimical-update-status";

type Props = Readonly<{
  configurationEnabled: boolean;
}>;

export function MimicalUpdateNotice({ configurationEnabled }: Props) {
  const [closed, setClosed] = useState(false);
  const downloaded = useSyncExternalStore(
    subscribeToMimicalDownload,
    hasDownloadedCurrentMimical,
    () => false,
  );

  if (closed || downloaded) return null;

  return (
    <aside className="mimical-update-notice notice" aria-label="Actualización de MIMICAL disponible">
      <div>
        <span>ACTUALIZACIÓN DISPONIBLE</span>
        <strong>MIMICAL {MIMICAL_VERSION}</strong>
        <p>Actualizá el complemento para incorporar la nueva corrección de sincronización de posiciones.</p>
      </div>
      <div className="mimical-update-notice-actions">
        {configurationEnabled ? (
          <a href="#configuracion">Ir a Configuración</a>
        ) : (
          <small>La actualización se habilita desde Admin Master.</small>
        )}
        <button type="button" aria-label="Cerrar aviso" onClick={() => setClosed(true)}>×</button>
      </div>
    </aside>
  );
}
