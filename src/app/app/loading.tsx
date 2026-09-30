export default function LoadingPrivateApp() {
  return (
    <main className="recovery-page nodal-loading-page">
      <section aria-label="Cargando NODAL" aria-live="polite" className="recovery-card nodal-loading-card" role="status">
        <span aria-hidden="true" className="nodal-loading-mark">
          <svg viewBox="0 0 48 48"><path d="M5 38V10h9l14 17V10h10v28h-9L15 21v17H5Z" /></svg>
          <i /><i /><i />
        </span>
        <h1>Cargando NODAL</h1>
        <span aria-hidden="true" className="nodal-loading-track"><i /></span>
      </section>
    </main>
  );
}
