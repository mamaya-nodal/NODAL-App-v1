const foundations = [
  "TypeScript estricto",
  "Reglas de negocio separadas de la interfaz",
  "Pruebas automáticas desde el inicio",
  "Sin datos reales ni conexiones externas",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">NODAL APP · ENTORNO LOCAL</p>
        <h1 id="page-title">La base técnica ya está en construcción.</h1>
        <p className="summary">
          Este entorno todavia no reemplaza Sheets. Su objetivo actual es
          validar la estructura, las reglas y las pruebas antes de conectar
          usuarios o información real.
        </p>
      </section>

      <section className="panel" aria-labelledby="foundation-title">
        <div>
          <p className="status">ETAPA 1</p>
          <h2 id="foundation-title">Fundación segura</h2>
        </div>
        <ul>
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
