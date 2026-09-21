import type { PeriodOpeningRecord } from "@/modules/summary/domain/opening-snapshot";

import styles from "./opening-setup-preview.module.css";

function money(cents: number | null) {
  if (cents === null) return "Pendiente de Ninja";
  return new Intl.NumberFormat("es-AR", {
    currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency",
  }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function OpeningSnapshotHome({ opening }: Readonly<{ opening: PeriodOpeningRecord }>) {
  const capital = opening.mode === "zero"
    ? opening.contributedCapitalInCents + opening.walletBalanceInCents
    : opening.contributedCapitalInCents - opening.personalWithdrawalsInCents;
  const live = opening.liveEvaluationAccounts + opening.fundedAccounts;
  return <article className={styles.savedOpening}>
    <div><span>PUNTO DE PARTIDA REGISTRADO</span><h2>{opening.mode === "zero" ? "Ciclo iniciado desde cero" : "Situación anterior reconstruida"}</h2><p>Corte al {date(opening.cutoverDate)} · los movimientos posteriores se calculan sobre esta apertura.</p></div>
    <div className={styles.savedMetrics}>
      <p><span>Capital neto inicial</span><strong>{money(capital)}</strong></p>
      <p><span>Resultado previo + flotante</span><strong>{money(opening.priorRealizedResultInCents + opening.floatingInCents)}</strong></p>
      <p><span>Cuentas vigentes</span><strong>{opening.virginAccounts + live}</strong></p>
    </div>
  </article>;
}

export function OpeningAccountReferences({ opening }: Readonly<{ opening: PeriodOpeningRecord }>) {
  const total = opening.virginAccounts + opening.liveEvaluationAccounts + opening.fundedAccounts;
  if (total === 0 && opening.closedAccountsReference === 0) return null;
  return <article className={styles.openingAccounts}>
    <div><span>APERTURA · {date(opening.cutoverDate)}</span><h3>Cuentas declaradas al ingresar a NODAL</h3><p>Son referencias de migración. Las cerradas anteriores no se recrearon ni generan operaciones.</p></div>
    <div className={styles.openingCounts}>
      <p><span>Vírgenes</span><strong>{opening.virginAccounts}</strong></p>
      <p><span>Evaluación activas</span><strong>{opening.liveEvaluationAccounts}</strong></p>
      <p><span>Funded activas</span><strong>{opening.fundedAccounts}</strong></p>
      <p><span>Cerradas previas</span><strong>{opening.closedAccountsReference}</strong></p>
    </div>
    {opening.batches.length > 0 ? <div className={styles.openingBatches}>{opening.batches.map((batch, index) => <p key={`${batch.companyName}-${batch.stage}-${index}`}><strong>{batch.companyName} · {batch.accountCount} cuentas</strong><span>{batch.stage === "virgin" ? "Vírgenes" : batch.stage === "evaluation" ? "Evaluación" : "Funded"} · Cash value {money(batch.currentCashValueInCents)}</span></p>)}</div> : null}
  </article>;
}

export function OpeningOperationReference({ opening }: Readonly<{ opening: PeriodOpeningRecord }>) {
  if (opening.mode !== "reconstruct") return null;
  return <article className={styles.openingOperation}>
    <div><span>HISTORIAL ANTERIOR RESUMIDO</span><strong>Corte {date(opening.cutoverDate)}</strong></div>
    <p>No se inventaron trades individuales. La apertura conserva un resultado realizado de <b>{money(opening.priorRealizedResultInCents)}</b> y un flotante de <b>{money(opening.floatingInCents)}</b>.</p>
  </article>;
}
