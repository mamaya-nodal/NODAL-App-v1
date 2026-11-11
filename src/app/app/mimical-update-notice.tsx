"use client";

import { useState } from "react";

import { isConfirmedMimicalVersion, MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

type Props = Readonly<{
  configurationEnabled: boolean;
  reportedVersion?: string | null;
}>;

export function MimicalUpdateNotice({ configurationEnabled, reportedVersion = null }: Props) {
  const [closed, setClosed] = useState(false);

  if (closed || isConfirmedMimicalVersion(reportedVersion)) return null;

  return (
    <aside className="mimical-update-notice notice" aria-label="Actualización de MIMICAL disponible">
      <div>
        <span>ACTUALIZACIÓN DISPONIBLE</span>
        <strong>Nueva versión de MIMICAL disponible (v{MIMICAL_VERSION})</strong>
        <p>El aviso se actualizará cuando NinjaTrader confirme la nueva versión.</p>
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
