import Image from "next/image";

import { AuthCard } from "./auth-card";
import { BackgroundVideo } from "./background-video";
import styles from "./public-access.module.css";

// Previous public screen retained temporarily while the new access screen is validated.
const foundations = [
  "TypeScript estricto",
  "Reglas de negocio separadas de la interfaz",
  "Pruebas automáticas desde el inicio",
  "Sin datos reales de alumnos",
];

function LegacyHomePage() {
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

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.googleMark}>
      <path fill="#4285F4" d="M21.35 12.24c0-.72-.06-1.42-.19-2.09H12v3.95h5.24a4.48 4.48 0 0 1-1.94 2.94v2.56h3.14c1.84-1.69 2.91-4.19 2.91-7.36Z" />
      <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.44-2.35l-3.14-2.56c-.87.58-1.98.92-3.3.92-2.53 0-4.67-1.71-5.44-4.01H3.32v2.65A9.73 9.73 0 0 0 12 21.75Z" />
      <path fill="#FBBC05" d="M6.56 13.75A5.85 5.85 0 0 1 6.25 12c0-.61.11-1.2.31-1.75V7.6H3.32A9.73 9.73 0 0 0 2.25 12c0 1.57.38 3.06 1.07 4.4l3.24-2.65Z" />
      <path fill="#EA4335" d="M12 6.24c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.34 9.34 0 0 0 12 2.25 9.73 9.73 0 0 0 3.32 7.6l3.24 2.65c.77-2.3 2.91-4.01 5.44-4.01Z" />
    </svg>
  );
}

function AccountVisual() {
  return (
    <div className={styles.visual} aria-hidden="true">
      <div className={styles.visualGlow} />
      <div className={styles.visualHeader}>
        <span>ACTIVIDAD DE CUENTAS</span>
        <span className={styles.liveStatus}>EN LINEA</span>
      </div>
      <svg className={styles.chart} viewBox="0 0 620 300" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#74ff32" stopOpacity=".34" />
            <stop offset="1" stopColor="#74ff32" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className={styles.gridLine} d="M0 60H620M0 120H620M0 180H620M0 240H620" />
        <path className={styles.area} d="M0 250 50 230 94 238 135 190 180 202 224 152 270 168 318 116 366 142 414 92 456 104 505 52 552 76 620 22 620 300 0 300Z" />
        <path className={styles.line} d="M0 250 50 230 94 238 135 190 180 202 224 152 270 168 318 116 366 142 414 92 456 104 505 52 552 76 620 22" />
      </svg>
      <div className={`${styles.accountCard} ${styles.accountOne}`}>
        <span className={styles.accountDot} />
        <div><strong>LFE05088021070001</strong><small>EVALUATION</small></div>
        <b>ACTIVA</b>
      </div>
      <div className={`${styles.accountCard} ${styles.accountTwo}`}>
        <span className={styles.accountDot} />
        <div><strong>Deteccion automatica</strong><small>NINJATRADER CONECTADO</small></div>
        <b>OK</b>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.login} aria-labelledby="access-title">
        <div className={styles.loginCard}>
          <Image className={styles.loginLogo} src="/nodal-trading-lime.png" alt="NODAL Trading" width={175} height={50} priority />
          <AuthCard />
        </div>
      </section>

      <section className={styles.videoPanel} aria-hidden="true">
        <BackgroundVideo />
        <div className={styles.videoShade} />
      </section>
    </main>
  );
}
