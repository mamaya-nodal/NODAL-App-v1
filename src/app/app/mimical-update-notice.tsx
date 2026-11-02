"use client";

import { useState } from "react";

import { MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

type Props = Readonly<{
  configurationEnabled: boolean;
}>;

export function MimicalUpdateNotice({ configurationEnabled }: Props) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

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
        <button type="button" aria-label="Cerrar aviso" onClick={() => setVisible(false)}>×</button>
      </div>
    </aside>
  );
}
