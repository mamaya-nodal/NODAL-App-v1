const foundations = [
  "TypeScript estricto",
  "Reglas de negocio separadas de la interfaz",
  "Pruebas automáticas desde el inicio",
  "Sin datos reales de alumnos",
];

export default function HomePage() {
  return (
    <main className="shell landing-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">NODAL APP · VERSIÓN PRIVADA DE PRUEBA</p>
        <h1 id="page-title">La base técnica ya está conectada.</h1>
        <p className="summary">
          Esta versión todavía no reemplaza Sheets. Su objetivo actual es
          validar la estructura, las reglas y el recorrido completo antes de
          conectar alumnos o información real.
        </p>
      </section>

      <section className="panel" aria-labelledby="foundation-title">
        <div>
          <p className="status">ETAPA 1</p>
          <h2 id="foundation-title">Entorno de desarrollo seguro</h2>
        </div>
        <ul>
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>
      </section>

      <section className="access-panel" aria-labelledby="access-title">
        <div>
          <p className="status">ACCESO DE PRUEBA</p>
          <h2 id="access-title">Ingresar al espacio privado</h2>
          <p className="summary compact">
            Google verifica tu identidad. El permiso para usar NODAL se valida
            por separado dentro de la aplicacion.
          </p>
        </div>
        <a className="primary-action" href="/auth/login">
          Ingresar con Google
        </a>
      </section>
    </main>
  );
}
