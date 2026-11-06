"use client";

import Image from "next/image";
import { Fragment, type FormEvent, useEffect, useRef, useState } from "react";

import type { NodalitoFinding } from "@/modules/agent/domain/deterministic-audit";
import {
  NODALITO_GUIDES,
} from "@/modules/agent/domain/nodalito-faq";
import styles from "./nodal-agent-pilot.module.css";

type Message = Readonly<{
  id: number;
  findings?: readonly NodalitoFinding[];
  question?: string;
  reportedCaseId?: string;
  role: "agent" | "user";
  text: string;
}>;

type AgentCase = Readonly<{
  created_at: string;
  description: string;
  id: string;
  nodal_users?: { display_name?: string | null; email?: string | null } | null;
  priority: string;
  resolution_note: string | null;
  status: "open" | "investigating" | "resolved" | "dismissed";
  title: string;
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

function renderNodalitoText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/app[^)]*\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const link = /^\[([^\]]+)\]\((\/app[^)]*)\)$/.exec(part);
    if (link) {
      return <a href={link[2]} key={index}>{link[1]}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function NodalAgentPilot() {
  const [activeFunction, setActiveFunction] = useState<AgentFunction>("nodalito");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);
  const [cases, setCases] = useState<readonly AgentCase[]>([]);
  const [caseView, setCaseView] = useState(false);
  const [masterCases, setMasterCases] = useState(false);
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

    setLoading(true);
    try {
      const response = await fetch("/api/agent/nodalito/query", {
        body: JSON.stringify({
          history: messages.slice(-8).map((message) => ({ role: message.role === "agent" ? "assistant" : "user", text: message.text })),
          question,
        }),
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
        question,
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

  async function loadCases() {
    setCaseLoading(true);
    setCaseView(true);
    try {
      const response = await fetch("/api/agent/nodalito/cases", { cache: "no-store" });
      const payload = await response.json() as { cases?: AgentCase[]; master?: boolean };
      setCases(payload.cases ?? []);
      setMasterCases(Boolean(payload.master));
    } finally {
      setCaseLoading(false);
    }
  }

  async function reportMessage(message: Message) {
    if (!message.question || message.reportedCaseId) return;
    setCaseLoading(true);
    try {
      const primary = message.findings?.[0];
      const response = await fetch("/api/agent/nodalito/cases", {
        body: JSON.stringify({
          category: primary?.category ?? "general",
          description: message.text,
          evidence: message.findings ?? [],
          priority: message.findings?.some((finding) => finding.severity === "critical") ? "critical" : "normal",
          sourceAnswer: message.text,
          sourceQuestion: message.question,
          title: primary?.title ?? `Consulta: ${message.question}`,
        }),
        headers: { "content-type": "application/json" }, method: "POST",
      });
      const payload = await response.json() as { case?: { id: string } };
      if (payload.case?.id) {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reportedCaseId: payload.case!.id } : item));
      }
    } finally {
      setCaseLoading(false);
    }
  }

  async function updateCase(agentCase: AgentCase, status: AgentCase["status"]) {
    setCaseLoading(true);
    await fetch("/api/agent/nodalito/cases", {
      body: JSON.stringify({ id: agentCase.id, status }), headers: { "content-type": "application/json" }, method: "PATCH",
    });
    await loadCases();
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
              <div className={styles.agentSubnav}>
                <button aria-current={!caseView ? "page" : undefined} onClick={() => setCaseView(false)} type="button">Conversación</button>
                <button aria-current={caseView ? "page" : undefined} onClick={() => void loadCases()} type="button">Casos</button>
              </div>
              {!caseView ? <>
              {messages.map((message) => (
                <article className={message.role === "user" ? styles.userMessage : styles.agentMessage} key={message.id}>
                  <p>{renderNodalitoText(message.text)}</p>
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
                  {message.role === "agent" && message.question && (message.findings?.length ?? 0) > 0 ? (
                    <button className={styles.reportButton} disabled={caseLoading || Boolean(message.reportedCaseId)} onClick={() => void reportMessage(message)} type="button">
                      {message.reportedCaseId ? "Reportado al Admin Master" : "Reportar al Admin Master"}
                    </button>
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
              </> : (
                <div className={styles.caseList}>
                  <p className={styles.caseHeading}>{masterCases ? "Bandeja de Admin Master" : "Mis reportes"}</p>
                  {caseLoading && !cases.length ? <p className={styles.thinking}>Cargando casos…</p> : null}
                  {!caseLoading && !cases.length ? <p className={styles.emptyCases}>Todavía no hay casos reportados.</p> : null}
                  {cases.map((agentCase) => (
                    <article data-priority={agentCase.priority} key={agentCase.id}>
                      <div><strong>{agentCase.title}</strong><span>{agentCase.status === "open" ? "Nuevo" : agentCase.status === "investigating" ? "En revisión" : agentCase.status === "resolved" ? "Resuelto" : "Descartado"}</span></div>
                      {masterCases && agentCase.nodal_users ? <small>{agentCase.nodal_users.display_name || agentCase.nodal_users.email}</small> : null}
                      <p>{agentCase.description}</p>
                      <time>{new Date(agentCase.created_at).toLocaleString("es-AR")}</time>
                      {masterCases && agentCase.status !== "resolved" ? <div className={styles.caseActions}>
                        <button onClick={() => void updateCase(agentCase, "investigating")} type="button">Revisar</button>
                        <button onClick={() => void updateCase(agentCase, "resolved")} type="button">Resolver</button>
                      </div> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.rutyxPlaceholder}>
              <span>R</span>
              <strong>Rutyx</strong>
              <p>Este espacio está preparado para integrar la gestión de rutas cuando Lorena comparta los archivos y el acceso.</p>
              <small>Integración pendiente</small>
            </div>
          )}

          {activeFunction === "nodalito" && !caseView ? (
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
          ) : null}
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
