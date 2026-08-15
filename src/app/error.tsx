"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El identificador permite correlacionar el incidente sin exponer datos al usuario.
    console.error("NODAL_APP_ERROR", { digest: error.digest });
  }, [error.digest]);

  return (
    <main className="recovery-page">
      <section className="recovery-card">
        <p className="eyebrow">NODAL APP</p>
        <h1>No pudimos mostrar esta pantalla.</h1>
        <p className="summary">
          Tus registros no se modificaron. Probá nuevamente; si el problema
          continúa, informá a NODAL qué pantalla estabas usando y la hora.
        </p>
        <div className="recovery-actions">
          <button className="primary-action" onClick={reset} type="button">
            Reintentar
          </button>
          <a className="secondary-action" href="/app">
            Volver al inicio
          </a>
        </div>
      </section>
    </main>
  );
}
