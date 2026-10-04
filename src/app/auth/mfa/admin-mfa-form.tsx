"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import styles from "../../public-access.module.css";

type Enrollment = Readonly<{ factorId: string; qrCode: string; secret: string }>;

function qrSource(value: string) {
  return value.startsWith("data:")
    ? value
    : `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

export function AdminMfaForm({ next }: Readonly<{ next: string }>) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function prepare() {
      const supabase = createClient();
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (assuranceError) {
        setError("No pudimos verificar el nivel de seguridad de la sesión.");
        setBusy(false);
        return;
      }
      if (assurance.currentLevel === "aal2") {
        router.replace(next);
        router.refresh();
        return;
      }

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factorsError) {
        setError("No pudimos consultar el segundo factor.");
        setBusy(false);
        return;
      }
      const verified = factors.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setBusy(false);
        return;
      }

      for (const factor of factors.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "NODAL Admin",
      });
      if (!active) return;
      if (enrollError || !enrolled || enrolled.type !== "totp") {
        setError("No pudimos preparar el autenticador. Revisá la configuración MFA de Supabase.");
        setBusy(false);
        return;
      }
      const prepared = {
        factorId: enrolled.id,
        qrCode: qrSource(enrolled.totp.qr_code),
        secret: enrolled.totp.secret,
      };
      setEnrollment(prepared);
      setFactorId(prepared.factorId);
      setBusy(false);
    }
    void prepare();
    return () => { active = false; };
  }, [next, router]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Ingresá el código de seis dígitos de tu autenticador.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setError("El código no es válido o venció. Esperá el siguiente e intentá nuevamente.");
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (busy && !factorId) return <p className={styles.mfaStatus}>Preparando verificación…</p>;

  return (
    <div className={styles.mfaContent}>
      {enrollment ? (
        <div className={styles.mfaEnrollment}>
          <p>Escaneá este código una sola vez con Google Authenticator, Microsoft Authenticator, Authy u otra app TOTP.</p>
          {/* Supabase genera este SVG para la sesión autenticada; nunca se persiste en la aplicación. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Código QR para configurar el segundo factor" className={styles.mfaQr} src={enrollment.qrCode} />
          <details className={styles.mfaSecret}>
            <summary>No puedo escanear el código</summary>
            <p>Ingresá manualmente esta clave en tu autenticador:</p>
            <code>{enrollment.secret}</code>
          </details>
        </div>
      ) : (
        <p className={styles.mfaStatus}>Abrí tu autenticador y usá el código de NODAL Admin.</p>
      )}
      <form className={styles.authForm} onSubmit={verify}>
        <label>Código temporal
          <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={code} />
        </label>
        {error ? <p className={styles.authError} role="alert">{error}</p> : null}
        <button className={styles.authSubmit} disabled={busy || code.length !== 6} type="submit">
          {busy ? "Verificando…" : "Verificar y continuar"}
        </button>
      </form>
    </div>
  );
}
