"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("NODAL_APP_GLOBAL_ERROR", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="es">
      <body className="recovery-page">
        <main className="recovery-card">
          <p className="eyebrow">NODAL APP</p>
          <h1>La aplicación necesita reintentarse.</h1>
          <p className="summary">
            No se modificaron registros por este error. Volvé a intentar o
            ingresá nuevamente más tarde.
          </p>
          <button className="primary-action" onClick={reset} type="button">
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
