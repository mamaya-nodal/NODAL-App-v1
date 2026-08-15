"use client";

import { FormEvent, useState } from "react";
import type { SummaryAlert } from "@/modules/summary/domain/summary-alerts";
import { investigateAlert, type DiagnosticChatResult } from "./diagnostic-actions";

type Message = Readonly<{ content: string; role: "assistant" | "user" }>;

export function AlertDiagnosticChat({ alertCode, periodId }: Readonly<{ alertCode: SummaryAlert["code"]; periodId: string }>) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [result, setResult] = useState<DiagnosticChatResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const question = String(data.get("question") ?? "").trim();
    if (!question) return;
    const history = messages.slice(-4);
    setMessages((current) => [...current, { content: question, role: "user" }]);
    setLoading(true);
    const response = await investigateAlert({ alertCode, history, periodId, question });
    setLoading(false);
    setResult(response);
    if (response.ok && response.answer) setMessages((current) => [...current, { content: response.answer?.summary ?? "", role: "assistant" }]);
    form.reset();
  }

  return <div className="diagnostic-chat">
    <button className="diagnostic-trigger" onClick={() => setOpen((value) => !value)} type="button">{open ? "Cerrar asistente" : "Investigar con NODAL IA"}</button>
    {open && <div className="diagnostic-panel">
      <div><strong>Asistente de diagnóstico</strong><p>Analiza esta alerta en modo de solo lectura. Nunca cambia saldos ni registros.</p></div>
      {messages.map((message, index) => <p className={`diagnostic-message diagnostic-${message.role}`} key={`${message.role}-${index}`}>{message.content}</p>)}
      {result && !result.ok && <p className="diagnostic-error">{result.message}</p>}
      {result?.ok && result.answer && <article className="diagnostic-answer">
        <div className="diagnostic-answer-heading"><strong>{result.answer.status === "verified" ? "Diagnóstico comprobado" : result.answer.status === "probable" ? "Causa probable" : "No se pudo determinar una causa"}</strong><span>{result.answer.confidence === "high" ? "Confianza alta" : result.answer.confidence === "medium" ? "Confianza media" : "Confianza baja"}</span></div>
        <p>{result.answer.cause}</p>
        {result.answer.evidence.length > 0 && <div className="diagnostic-evidence"><strong>Evidencia revisada</strong>{result.answer.evidence.map((item, index) => <p key={`${item.label}-${index}`}><b>{item.label}:</b> {item.detail}</p>)}</div>}
        <p><strong>Qué revisar:</strong> {result.answer.recommendedAction}</p>
        {result.usedAdvancedAnalysis && <small>Análisis avanzado aplicado automáticamente.</small>}
        {result.cached && <small>Se reutilizó un diagnóstico existente porque los datos no cambiaron.</small>}
      </article>}
      <form className="diagnostic-form" onSubmit={submit}>
        <label htmlFor={`diagnostic-${alertCode}`}>Preguntale sobre esta alerta</label>
        <div><input id={`diagnostic-${alertCode}`} maxLength={600} name="question" placeholder="Ejemplo: ¿Dónde está el problema?" required /><button disabled={loading} type="submit">{loading ? "Investigando…" : "Enviar"}</button></div>
      </form>
    </div>}
  </div>;
}
