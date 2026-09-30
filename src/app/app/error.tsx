"use client";

import { useEffect } from "react";

export default function PrivateAppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("NODAL_PRIVATE_APP_RENDER_FAILED", {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="recovery-page">
      <section className="recovery-card" role="alert">
        <h1>No pudimos abrir la aplicación</h1>
        <p className="summary">Tus registros y vínculos se conservan.</p>
        <div className="recovery-actions">
          <button className="primary-action" onClick={retry} type="button">Reintentar</button>
          <a className="secondary-action" href="/auth/login?next=/app">Volver a ingresar con Google</a>
        </div>
      </section>
    </main>
  );
}
