export default function LoadingPrivateApp() {
  return (
    <main className="recovery-page nodal-loading-page">
      <section aria-label="Cargando NODAL" aria-live="polite" className="recovery-card nodal-loading-card" role="status">
        <span aria-hidden="true" className="nodal-loading-mark">
          <img alt="" src="/nodal-mark.png" />
          <i /><i /><i />
        </span>
        <h1>Cargando NODAL</h1>
        <span aria-hidden="true" className="nodal-loading-track"><i /></span>
      </section>
    </main>
  );
}
