"use client";

import { useActionState } from "react";

import {
  initialOpeningRevisionRequestState,
  requestPeriodOpeningRevision,
} from "./opening-revision-actions";
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
  const [state, action, pending] = useActionState(
    requestPeriodOpeningRevision,
    initialOpeningRevisionRequestState,
  );

  if (status === "approved") {
    return <div className={styles.revisionStatus}><strong>Edición autorizada</strong><span>Ya podés rehacer el punto de partida.</span></div>;
  }
  if (status === "pending" || state.ok) {
    return <div className={styles.revisionStatus}><strong>Solicitud pendiente</strong><span>Admin Master debe aprobarla.</span></div>;
  }
  if (!eligible) {
    return <div className={styles.revisionStatus}><strong>Apertura protegida</strong><span>Con actividad registrada, la corrección requiere revisión contable.</span></div>;
  }

  return <form action={action} className={styles.revisionRequest}>
    <input name="period_id" type="hidden" value={periodId} />
    <button disabled={pending} type="submit">{pending ? "Enviando…" : "Solicitar edición"}</button>
    {state.message ? <small className={state.ok ? styles.successMessage : styles.errorMessage} role="status">{state.message}</small> : null}
  </form>;
}
