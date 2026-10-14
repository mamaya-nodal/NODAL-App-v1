"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./opening-setup-preview.module.css";

export type OpeningRevisionRequestStatus = "approved" | "pending" | null;

export function OpeningRevisionRequest({
  eligible,
  periodId,
  status,
}: Readonly<{
  eligible: boolean;
  periodId: string;
  status: OpeningRevisionRequestStatus;
}>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState({ message: "", ok: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState({ message: "", ok: false });
    try {
      const response = await fetch("/api/opening-revision-requests", {
        body: JSON.stringify({ periodId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as { message?: unknown; ok?: unknown };
      const nextState = {
        message: typeof result.message === "string"
          ? result.message
          : "No pudimos enviar la solicitud. Volvé a intentar.",
        ok: response.ok && result.ok === true,
      };
      setState(nextState);
      if (nextState.ok) router.refresh();
    } catch {
      setState({ message: "No pudimos enviar la solicitud. Volvé a intentar.", ok: false });
    } finally {
      setPending(false);
    }
  }

  if (status === "approved") {
    return <div className={styles.revisionStatus}><strong>Edición autorizada</strong><span>Ya podés rehacer el punto de partida.</span></div>;
  }
  if (status === "pending" || state.ok) {
    return <div className={styles.revisionStatus}><strong>Solicitud pendiente</strong><span>Admin Master debe aprobarla.</span></div>;
  }
  if (!eligible) {
    return <div className={styles.revisionStatus}><strong>Apertura protegida</strong><span>Con actividad registrada, la corrección requiere revisión contable.</span></div>;
  }

  return <form className={styles.revisionRequest} onSubmit={submit}>
    <button disabled={pending} type="submit">{pending ? "Enviando…" : "Solicitar edición"}</button>
    {state.message ? <small className={state.ok ? styles.successMessage : styles.errorMessage} role="status">{state.message}</small> : null}
  </form>;
}
