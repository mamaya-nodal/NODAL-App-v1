"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { NodalitoFinding } from "@/modules/agent/domain/deterministic-audit";
import {
  findNodalitoGuide,
  NODALITO_GUIDES,
  type NodalitoGuide,
} from "@/modules/agent/domain/nodalito-faq";
import styles from "./nodal-agent-pilot.module.css";

type Message = Readonly<{
  id: number;
  findings?: readonly NodalitoFinding[];
  guide?: NodalitoGuide;
  role: "agent" | "user";
  text: string;
}>;

type AgentFunction = "nodalito" | "rutyx";

const openingMessage: Message = {
  id: 1,
  role: "agent",
  text: "Hola, Mauricio. Soy Nodalito. Puedo guiarte dentro de la app o ejecutar controles determinísticos sobre la operación.",
};

const suggestedQuestions = [
  "¿Dónde veo las billeteras?",
  "¿Cómo cargo un movimiento de saldo de una billetera?",
  "¿Cómo registro un payout?",
  "Revisá los problemas actuales",
] as const;

export function NodalAgentPilot() {
  const [activeFunction, setActiveFunction] = useState<AgentFunction>("nodalito");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([openingMessage]);
  const [showGuides, setShowGuides] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextMessageId = useRef(2);

  useEffect(() => {
    if (open && activeFunction === "nodalito") inputRef.current?.focus();
  }, [activeFunction, open]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function askQuestion(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const nextId = nextMessageId.current;
    nextMessageId.current += 2;
    setMessages((current) => [...current, { id: nextId, role: "user", text: question }]);
    setShowGuides(false);

    const guide = findNodalitoGuide(question);
    if (guide) {
      setMessages((current) => [...current, {
        guide,
        id: nextId + 1,
        role: "agent",
        text: guide.summary,
      }]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/agent/nodalito/query", {
        body: JSON.stringify({ question }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as {
        answer?: Readonly<{ findings: readonly NodalitoFinding[]; summary: string }>;
        message?: string;
      };
      setMessages((current) => [...current, payload.answer ? {
        findings: payload.answer.findings,
        id: nextId + 1,
        role: "agent",
        text: payload.answer.summary,
      } : {
        id: nextId + 1,
        role: "agent",
        text: payload.message ?? "No pude completar la consulta.",
      }]);
    } catch {
      setMessages((current) => [...current, {
        id: nextId + 1,
        role: "agent",
        text: "No pude conectarme con el diagnóstico de NODAL. No se modificó ningún dato.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void askQuestion(text);
  }

  return (
    <div className={styles.root} data-open={open ? "true" : "false"}>
      {open ? (
        <section aria-label="Nodalito" className={styles.panel} role="dialog">
          <header className={styles.header}>
            <div className={styles.agentIdentity}>
              <span className={styles.headerMascot}>
                <Image alt="" fill sizes="48px" src="/nodalbot.png" />
              </span>
              <div>
                <strong>Nodalito</strong>
                <span><i /> Piloto · solo lectura</span>
              </div>
            </div>
            <button aria-label="Cerrar agente" className={styles.closeButton} onClick={() => setOpen(false)} type="button">×</button>
          </header>

          <nav aria-label="Funciones de Nodalito" className={styles.functions}>
            <button
              aria-current={activeFunction === "nodalito" ? "page" : undefined}
              onClick={() => setActiveFunction("nodalito")}
              type="button"
            >
              <strong>Consultar a Nodalito</strong>
              <span>Auditoría y asistencia</span>
            </button>
            <button
              aria-current={activeFunction === "rutyx" ? "page" : undefined}
              onClick={() => setActiveFunction("rutyx")}
              type="button"
            >
              <strong>Usar Rutyx</strong>
              <span>Gestión de rutas</span>
            </button>
          </nav>

          {activeFunction === "nodalito" ? (
            <div aria-live="polite" className={styles.messages}>
              <p className={styles.pilotNotice}>Guías y auditorías determinísticas · sin reparaciones automáticas</p>
              {messages.map((message) => (
                <article className={message.role === "user" ? styles.userMessage : styles.agentMessage} key={message.id}>
                  <p>{message.text}</p>
                  {message.guide ? (
                    <div className={styles.guideAnswer}>
                      <ol>{message.guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                      <Link href={message.guide.href}>{message.guide.actionLabel}</Link>
                    </div>
                  ) : null}
                  {message.findings?.length ? (
                    <div className={styles.findings}>
                      {message.findings.slice(0, 8).map((finding) => (
                        <div data-severity={finding.severity} key={finding.id}>
                          <strong>{finding.userName ? `${finding.userName} · ` : ""}{finding.title}</strong>
                          <span>{finding.detail}</span>
                          <small>{finding.evidence}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {loading ? <p className={styles.thinking}>Revisando datos y reglas…</p> : null}
              {messages.length === 1 ? (
                <div className={styles.quickQuestions}>
                  {suggestedQuestions.map((question) => (
                    <button key={question} onClick={() => void askQuestion(question)} type="button">{question}</button>
                  ))}
                  <button className={styles.allGuidesButton} onClick={() => setShowGuides((current) => !current)} type="button">
                    {showGuides ? "Ocultar guías" : `Ver todas las guías (${NODALITO_GUIDES.length})`}
                  </button>
                </div>
              ) : null}
              {showGuides ? (
                <div className={styles.guideDirectory}>
                  {NODALITO_GUIDES.map((guide) => (
                    <button key={guide.id} onClick={() => void askQuestion(guide.question)} type="button">{guide.question}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={styles.rutyxPlaceholder}>
              <span>R</span>
              <strong>Rutyx</strong>
              <p>Este espacio está preparado para integrar la gestión de rutas cuando Lorena comparta los archivos y el acceso.</p>
              <small>Integración pendiente</small>
            </div>
          )}

          {activeFunction === "nodalito" ? (
            <form className={styles.composer} onSubmit={submitMessage}>
              <input
                aria-label="Mensaje para Nodalito"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribí un mensaje..."
                ref={inputRef}
                value={draft}
              />
              <button aria-label="Enviar mensaje" disabled={!draft.trim() || loading} type="submit">↑</button>
            </form>
          ) : <div className={styles.integrationFooter}>Rutyx se habilitará en este mismo panel.</div>}
        </section>
      ) : null}

      <button
        aria-expanded={open}
        aria-label={open ? "Cerrar Nodalito" : "Abrir Nodalito"}
        className={styles.launcher}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={styles.launcherGlow} />
        <span className={styles.launcherImage}>
          <Image alt="Nodalito" fill priority sizes="76px" src="/nodalbot.png" />
        </span>
      </button>
    </div>
  );
}
