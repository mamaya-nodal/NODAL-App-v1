"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "./public-access.module.css";

type Mode = "login" | "signup";

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

export function AuthCard() {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("No pudimos ingresar con esos datos.");
        setBusy(false);
        return;
      }
      window.location.assign("/app");
      return;
    }

    const firstName = String(form.get("first_name") ?? "").trim();
    const lastName = String(form.get("last_name") ?? "").trim();
    const username = String(form.get("username") ?? "").trim().toLowerCase();

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setBusy(false);
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/auth/complete-profile`;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: firstName,
          full_name: `${firstName} ${lastName}`.trim(),
          last_name: lastName,
          username,
        },
      },
    });

    if (signUpError) {
      setError("No pudimos crear la cuenta. Revisa los datos e intenta nuevamente.");
      setBusy(false);
      return;
    }

    if (data.session) {
      window.location.assign("/auth/complete-profile");
      return;
    }

    setMessage("Te enviamos un email para validar tu cuenta.");
    setBusy(false);
  }

  return (
    <div className={styles.authContent}>
      <div className={styles.authTabs} aria-label="Elegir tipo de acceso">
        <button className={mode === "login" ? styles.authTabActive : styles.authTab} onClick={() => { setMode("login"); setError(null); setMessage(null); }} type="button">Ingresar</button>
        <button className={mode === "signup" ? styles.authTabActive : styles.authTab} onClick={() => { setMode("signup"); setError(null); setMessage(null); }} type="button">Crear cuenta</button>
      </div>

      <h1>{mode === "login" ? "Bienvenido" : "Crea tu cuenta"}</h1>

      <a className={styles.googleButton} href="/auth/login?next=/auth/complete-profile">
        <GoogleMark />
        <span>Continuar con Google</span>
      </a>

      <div className={styles.authDivider}><span>o</span></div>

      <form className={styles.authForm} onSubmit={submit}>
        {mode === "signup" ? (
          <>
            <div className={styles.authNameRow}>
              <label>Nombre<input autoComplete="given-name" name="first_name" required /></label>
              <label>Apellido<input autoComplete="family-name" name="last_name" required /></label>
            </div>
            <label>Nombre de usuario<input autoCapitalize="none" autoComplete="username" minLength={3} name="username" pattern="[A-Za-z0-9._-]+" required /></label>
          </>
        ) : null}
        <label>Email<input autoComplete="email" inputMode="email" name="email" required type="email" /></label>
        <label>Contraseña<input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} name="password" required type="password" /></label>
        {error ? <p className={styles.authError} role="alert">{error}</p> : null}
        {message ? <p className={styles.authSuccess} role="status">{message}</p> : null}
        <button className={styles.authSubmit} disabled={busy} type="submit">
          {busy ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
