"use client";

type RecoverySubject = "access" | "connector" | "data";

const recoveryTitles: Record<RecoverySubject, string> = {
  access: "No pudimos verificar tu acceso",
  connector: "No pudimos consultar tu conexión",
  data: "No pudimos cargar los datos",
};

export function ConnectionRecovery({ subject }: { subject: RecoverySubject }) {
  return (
    <main className="recovery-page">
      <section className="recovery-card" role="alert">
        <h1>{recoveryTitles[subject]}</h1>
        <p className="summary">La consulta no se completó. Tus registros y vínculos se conservan.</p>
        <div className="recovery-actions">
          <button className="primary-action" onClick={() => window.location.reload()} type="button">Reintentar</button>
          <a className="secondary-action" href="/auth/login?next=/app">Volver a ingresar con Google</a>
        </div>
      </section>
    </main>
  );
}
