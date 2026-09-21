"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { confirmOpeningSetup } from "./opening-setup-actions";
import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import styles from "./opening-setup-preview.module.css";

type StartMode = "reconstruct" | "zero";

type Props = Readonly<{
  autoOpen?: boolean;
  liveBrokerBalance?: NinjaLiveBrokerBalance | null;
  periodId: string;
}>;

type WalletDraft = Readonly<{ balance: string; id: string; name: string }>;

type BatchDraft = Readonly<{
  accountCount: string;
  accountSize: string;
  companyName: string;
  costPerAccount: string;
  currentCashValue: string;
  stage: "evaluation" | "funded" | "virgin";
}>;

type Draft = Readonly<{
  closedAccounts: string;
  contributedCapital: string;
  fundedAccounts: string;
  liveEvaluationAccounts: string;
  pendingPayouts: string;
  personalWithdrawals: string;
  reconstructionDate: string;
  virginAccounts: string;
  workingCapital: string;
}>;

const initialDraft: Draft = {
  closedAccounts: "",
  contributedCapital: "",
  fundedAccounts: "",
  liveEvaluationAccounts: "",
  pendingPayouts: "",
  personalWithdrawals: "",
  reconstructionDate: new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(new Date()),
  virginAccounts: "",
  workingCapital: "",
};

const initialBatch: BatchDraft = {
  accountCount: "", accountSize: "50000", companyName: "", costPerAccount: "",
  currentCashValue: "", stage: "evaluation",
};

const zeroSteps = ["Punto de partida", "Dinero disponible", "Cuentas iniciales", "Vista previa"];
const reconstructionSteps = ["Punto de partida", "Fecha de corte", "Cuentas actuales", "Dinero actual", "Progreso previo", "Vista previa"];

function amount(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function Field({
  hint,
  label,
  name,
  onChange,
  placeholder,
  type = "text",
  value,
}: Readonly<{
  hint?: string;
  label: string;
  name: keyof Draft;
  onChange: (name: keyof Draft, value: string) => void;
  placeholder?: string;
  type?: "date" | "number" | "text";
  value: string;
}>) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        inputMode={type === "number" ? "decimal" : undefined}
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Choice({
  badge,
  children,
  onClick,
  title,
}: Readonly<{
  badge: string;
  children: string;
  onClick: () => void;
  title: string;
}>) {
  return (
    <button className={styles.choice} onClick={onClick} type="button">
      <span>{badge}</span>
      <strong>{title}</strong>
      <p>{children}</p>
      <b>Elegir esta opción →</b>
    </button>
  );
}

function SummaryItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className={styles.summaryItem}><span>{label}</span><strong>{value}</strong></div>;
}

function WalletEditor({ onChange, wallets }: Readonly<{
  onChange: (wallets: WalletDraft[]) => void;
  wallets: WalletDraft[];
}>) {
  return <div className={styles.walletEditor}>
    {wallets.map((wallet, index) => <div className={styles.walletRow} key={wallet.id}>
      <label className={styles.field}><span>Nombre de la billetera</span><input aria-label={`Nombre de billetera ${index + 1}`} onChange={(event) => onChange(wallets.map((item) => item.id === wallet.id ? { ...item, name: event.target.value } : item))} value={wallet.name} /></label>
      <label className={styles.field}><span>Saldo (USD)</span><input aria-label={`Saldo de billetera ${index + 1}`} inputMode="decimal" min="0" onChange={(event) => onChange(wallets.map((item) => item.id === wallet.id ? { ...item, balance: event.target.value } : item))} type="number" value={wallet.balance} /></label>
      {wallets.length > 1 ? <button aria-label={`Eliminar billetera ${index + 1}`} className={styles.removeWallet} onClick={() => onChange(wallets.filter((item) => item.id !== wallet.id))} type="button">×</button> : null}
    </div>)}
    <button className={styles.secondaryButton} onClick={() => onChange([...wallets, { balance: "", id: crypto.randomUUID(), name: "" }])} type="button">+ Agregar billetera</button>
  </div>;
}

export function OpeningSetupPreview({ autoOpen = false, liveBrokerBalance = null, periodId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [mode, setMode] = useState<StartMode | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [wallets, setWallets] = useState<WalletDraft[]>([{ balance: "", id: "opening-wallet-1", name: "" }]);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batch, setBatch] = useState<BatchDraft>(initialBatch);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const steps = mode === "reconstruct" ? reconstructionSteps : zeroSteps;
  const lastStep = steps.length - 1;

  const totals = useMemo(() => {
    const broker = (liveBrokerBalance?.balanceInCents ?? 0) / 100;
    const walletTotal = wallets.reduce((total, wallet) => total + amount(wallet.balance), 0);
    const observable = broker + walletTotal + amount(draft.pendingPayouts);
    const netCapital = mode === "zero"
      ? broker + walletTotal
      : amount(draft.contributedCapital) - amount(draft.personalWithdrawals);
    const inferredResult = observable - netCapital;
    return {
      inferredResult,
      netCapital,
      observable,
      walletTotal,
    };
  }, [draft, liveBrokerBalance, mode, wallets]);

  function update(name: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function choose(nextMode: StartMode) {
    setMode(nextMode);
    setStep(1);
    setMessage(null);
  }

  function restart() {
    setMode(null);
    setStep(0);
    setDraft(initialDraft);
    setBatch(initialBatch);
    setWallets([{ balance: "", id: "opening-wallet-1", name: "" }]);
    setShowBatchForm(false);
    setMessage(null);
  }

  function finishSetup() {
    if (!mode) return;
    setMessage(null);
    startTransition(async () => {
      const result = await confirmOpeningSetup({ ...draft, batches: showBatchForm ? [batch] : [], mode, periodId, wallets });
      setMessage(result.message);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <article className={styles.launcher}>
        <div>
          <span>PREPARACIÓN INICIAL</span>
          <h2>Configurá tu punto de partida</h2>
          <p>
            Elegí si empezás desde cero o si necesitás reconstruir la situación con la que llegás a NODAL.
          </p>
        </div>
        <button onClick={() => setOpen(true)} type="button">
          Comenzar
        </button>
      </article>

      {open ? (
        <div className={styles.backdrop} role="presentation">
          <section aria-labelledby="opening-setup-title" aria-modal="true" className={styles.dialog} role="dialog">
            <header className={styles.header}>
              <div>
                <span>CONFIGURACIÓN DE APERTURA</span>
                <h2 id="opening-setup-title">Tu punto de partida en NODAL</h2>
              </div>
              <button aria-label="Cerrar configuración" className={styles.close} onClick={() => setOpen(false)} type="button">×</button>
            </header>

            <div className={styles.previewNotice}>
              <strong>Apertura real</strong>
              <span>Al confirmar, este pantallazo quedará guardado y alimentará tu panel. No se inventarán trades ni cuentas cerradas.</span>
            </div>

            <div className={styles.body}>
              <nav aria-label="Progreso de la preparación" className={styles.steps}>
                {steps.map((label, index) => (
                  <div className={index === step ? styles.activeStep : index < step ? styles.completedStep : ""} key={label}>
                    <i>{index < step ? "✓" : index + 1}</i>
                    <span>{label}</span>
                  </div>
                ))}
              </nav>

              <div className={styles.content}>
                {step === 0 ? (
                  <div className={styles.intro}>
                    <p className={styles.eyebrow}>ELEGÍ UNA OPCIÓN</p>
                    <h3>¿Cómo empezás a usar NODAL?</h3>
                    <p className={styles.description}>Esta decisión define qué información necesitamos antes de habilitar el registro diario.</p>
                    <div className={styles.choices}>
                      <Choice badge="NUEVO" onClick={() => choose("zero")} title="Empezar desde cero">
                        Todavía no operé este ciclo. Quiero registrar únicamente lo que tenga al comenzar.
                      </Choice>
                      <Choice badge="EN CURSO" onClick={() => choose("reconstruct")} title="Reconstruir mi situación actual">
                        Ya estoy operando y necesito traer capital, cuentas vivas, flotante y progreso anterior.
                      </Choice>
                    </div>
                  </div>
                ) : null}

                {mode === "zero" && step === 1 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>DINERO DISPONIBLE</p>
                    <h3>¿Con qué fondos comenzás?</h3>
                    <p className={styles.description}>El saldo broker se tomará del conector. Informá solamente el dinero disponible fuera del broker.</p>
                    <div className={styles.autoValue}><span>Saldo broker detectado</span><strong>{liveBrokerBalance ? money(liveBrokerBalance.balanceInCents / 100) : "Sin datos de Ninja"}</strong><small>Se toma automáticamente del conector y no se edita aquí.</small></div>
                    <WalletEditor onChange={setWallets} wallets={wallets} />
                  </div>
                ) : null}

                {mode === "zero" && step === 2 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>CUENTAS INICIALES</p>
                    <h3>¿Ya compraste cuentas para comenzar?</h3>
                    <p className={styles.description}>Ninja incorporará las cuentas detectadas. También podrás agregar cuentas operadas desde otra computadora.</p>
                    <div className={styles.detectedBox}>
                      <div><span>Cuentas detectadas ahora</span><strong>0</strong></div>
                      <p>Cuando el conector tenga señal, aparecerán aquí con su empresa e identificador.</p>
                    </div>
                    <Field hint="Solo para explorar cómo se verá el resumen." label="Cuentas vírgenes que querés registrar" name="virginAccounts" onChange={update} placeholder="0" type="number" value={draft.virginAccounts} />
                  </div>
                ) : null}

                {mode === "reconstruct" && step === 1 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>FECHA DE CORTE</p>
                    <h3>¿Desde qué día NODAL será tu registro oficial?</h3>
                    <p className={styles.description}>Todo lo anterior quedará resumido como apertura. Desde esta fecha, las nuevas operaciones se registrarán normalmente.</p>
                    <Field hint="Conviene hacer el corte sin posiciones abiertas." label="Fecha de reconstrucción" name="reconstructionDate" onChange={update} type="date" value={draft.reconstructionDate} />
                    <div className={styles.tip}><strong>Antes de continuar</strong><span>Cerrá las posiciones abiertas y verificá que los saldos visibles sean los definitivos del día.</span></div>
                  </div>
                ) : null}

                {mode === "reconstruct" && step === 2 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>CUENTAS ACTUALES</p>
                    <h3>Cargá solamente las cuentas que todavía existen</h3>
                    <p className={styles.description}>Las cuentas cerradas anteriores no se recrean. Su cantidad puede conservarse como referencia histórica.</p>
                    <div className={styles.fieldsThree}>
                      <Field label="Vírgenes" name="virginAccounts" onChange={update} placeholder="0" type="number" value={draft.virginAccounts} />
                      <Field label="En evaluación" name="liveEvaluationAccounts" onChange={update} placeholder="0" type="number" value={draft.liveEvaluationAccounts} />
                      <Field label="Funded activas" name="fundedAccounts" onChange={update} placeholder="0" type="number" value={draft.fundedAccounts} />
                    </div>
                    <div className={styles.historyReference}>
                      <Field hint="Solo referencia. No creará cuentas en el inventario." label="Cuentas cerradas antes de NODAL" name="closedAccounts" onChange={update} placeholder="0" type="number" value={draft.closedAccounts} />
                    </div>
                    <button className={styles.secondaryButton} onClick={() => setShowBatchForm((current) => !current)} type="button">
                      {showBatchForm ? "Ocultar lote" : "+ Agregar lote de cuentas"}
                    </button>
                    {showBatchForm ? (
                      <div className={styles.batchForm}>
                        <div className={styles.batchHeading}><strong>Lote 1</strong><span>Detalle opcional</span></div>
                        <div className={styles.fieldsThree}>
                          <label className={styles.field}><span>Empresa</span><select onChange={(event) => setBatch((current) => ({ ...current, companyName: event.target.value }))} value={batch.companyName}><option disabled value="">Elegí una empresa</option><option>LUCID</option><option>TRADEIFY</option><option>Otra</option></select></label>
                          <label className={styles.field}><span>Tamaño</span><select onChange={(event) => setBatch((current) => ({ ...current, accountSize: event.target.value }))} value={batch.accountSize}><option value="50000">US$ 50.000</option></select></label>
                          <label className={styles.field}><span>Etapa actual</span><select onChange={(event) => setBatch((current) => ({ ...current, stage: event.target.value as BatchDraft["stage"] }))} value={batch.stage}><option value="virgin">Virgen</option><option value="evaluation">Evaluación</option><option value="funded">Funded</option></select></label>
                          <label className={styles.field}><span>Cantidad</span><input min="1" onChange={(event) => setBatch((current) => ({ ...current, accountCount: event.target.value }))} placeholder="5" type="number" value={batch.accountCount} /></label>
                          <label className={styles.field}><span>Costo por cuenta</span><input onChange={(event) => setBatch((current) => ({ ...current, costPerAccount: event.target.value }))} placeholder="138,00" type="number" value={batch.costPerAccount} /></label>
                          <label className={styles.field}><span>Cash value actual</span><input onChange={(event) => setBatch((current) => ({ ...current, currentCashValue: event.target.value }))} placeholder="50.000,00" type="number" value={batch.currentCashValue} /></label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {mode === "reconstruct" && step === 3 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>POSICIÓN ACTUAL</p>
                    <h3>¿Qué dinero existe hoy dentro del circuito?</h3>
                    <p className={styles.description}>Los movimientos entre broker y billetera no son aportes nuevos. Registramos cada ubicación una sola vez.</p>
                    <div className={styles.autoValue}><span>Saldo broker detectado</span><strong>{liveBrokerBalance ? money(liveBrokerBalance.balanceInCents / 100) : "Sin datos de Ninja"}</strong><small>Se toma automáticamente del conector y no se edita aquí.</small></div>
                    <WalletEditor onChange={setWallets} wallets={wallets} />
                    <div className={styles.fields}>
                      <Field label="Payouts aprobados pendientes (USD)" name="pendingPayouts" onChange={update} placeholder="0,00" type="number" value={draft.pendingPayouts} />
                      <Field label="Capital externo aportado (USD)" name="contributedCapital" onChange={update} placeholder="0,00" type="number" value={draft.contributedCapital} />
                      <Field label="Retiros personales realizados (USD)" name="personalWithdrawals" onChange={update} placeholder="0,00" type="number" value={draft.personalWithdrawals} />
                    </div>
                  </div>
                ) : null}

                {mode === "reconstruct" && step === 4 ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>PROGRESO PREVIO</p>
                    <h3>Registrá lo que todavía está en juego</h3>
                    <p className={styles.description}>El resultado acumulado se infiere automáticamente desde tus saldos y el capital neto. Solo necesitamos el flotante de las cuentas que siguen vivas.</p>
                    <div className={styles.fields}>
                      <Field hint="Cobertura acumulada de las cuentas que continúan vivas." label="Flotante actual (USD)" name="workingCapital" onChange={update} placeholder="0,00" type="number" value={draft.workingCapital} />
                    </div>
                    <div className={styles.tip}><strong>Después podrás detallarlo</strong><span>Los lotes de cuentas permitirán distribuir el flotante sin cargar cada operación anterior.</span></div>
                  </div>
                ) : null}

                {step === lastStep && mode ? (
                  <div className={styles.formSection}>
                    <p className={styles.eyebrow}>VISTA PREVIA DE APERTURA</p>
                    <h3>Así comenzaría tu cuenta</h3>
                    <p className={styles.description}>Revisá el pantallazo. Al confirmar, quedará como apertura auditable del período y se verá en el panel.</p>
                    <div className={styles.summaryGrid}>
                      <SummaryItem label="Capital neto aportado" value={money(totals.netCapital)} />
                      <SummaryItem label="Posición observable" value={money(totals.observable)} />
                      <SummaryItem label="Resultado acumulado inferido" value={money(totals.inferredResult)} />
                      <SummaryItem label="Flotante" value={money(amount(draft.workingCapital))} />
                      <SummaryItem label="Cuentas vigentes" value={String(amount(draft.virginAccounts) + amount(draft.liveEvaluationAccounts) + amount(draft.fundedAccounts))} />
                      <SummaryItem label="Cuentas cerradas previas" value={draft.closedAccounts || "0"} />
                    </div>
                    <div className={`${styles.reconciliation} ${styles.reconciled}`}>
                      <div><span>Diferencia de apertura</span><strong>{money(0)}</strong></div>
                      <p>La apertura queda conciliada por definición. Desde el corte, cualquier diferencia nueva aparecerá para revisión.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <footer className={styles.footer}>
              <button className={styles.textButton} onClick={restart} type="button">Cambiar opción</button>
              {message ? <p className={styles.actionMessage} role="status">{message}</p> : null}
              <div>
                {step > 0 ? <button className={styles.backButton} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Atrás</button> : null}
                {step > 0 && step < lastStep ? <button className={styles.nextButton} onClick={() => setStep((current) => Math.min(lastStep, current + 1))} type="button">Continuar</button> : null}
                {step === lastStep ? <button className={styles.nextButton} disabled={isPending} onClick={finishSetup} type="button">{isPending ? "Guardando…" : "Confirmar punto de partida"}</button> : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
