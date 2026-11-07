"use client";

import Image from "next/image";
import { Fragment, type FormEvent, useEffect, useRef, useState } from "react";

import type { NodalitoFinding } from "@/modules/agent/domain/deterministic-audit";
import {
  NODALITO_GUIDES,
} from "@/modules/agent/domain/nodalito-faq";
import styles from "./nodal-agent-pilot.module.css";
import { RutyxNavigator } from "./rutyx-navigator";
import { repairSummary } from "@/modules/agent/domain/repair-summary";

type Message = Readonly<{
  id: number;
  findings?: readonly NodalitoFinding[];
  question?: string;
  repairCompleted?: boolean;
  repairPreview?: { planId: string; label: string; details?: string[]; parameters: Record<string, unknown> };
  reportedCaseId?: string;
  role: "agent" | "user";
  text: string;
}>;

type AgentCase = Readonly<{
  category: string;
  created_at: string;
  description: string;
  evidence?: unknown;
  id: string;
  nodal_users?: { display_name?: string | null; email?: string | null } | null;
  priority: string;
  resolution_note: string | null;
  reviewed_at?: string | null;
  status: "open" | "investigating" | "resolved" | "dismissed";
  title: string;
}>;

type AgentFunction = "nodalito" | "rutyx";

function repairEvidence(agentCase: AgentCase) {
  const evidence = agentCase.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const data = evidence as { planId?: unknown; parameters?: Record<string, unknown>; reversal?: unknown; changes?: string[] };
  return typeof data.planId === "string" ? { planId: data.planId, parameters: data.parameters ?? {}, reverted: Boolean(data.reversal), changes: data.changes ?? [] } : null;
}

const openingMessage: Message = {
  id: 1,
  role: "agent",
  text: "Hola, soy Nodalito. Puedo guiarte en la app, revisar tus registros y ayudarte a resolver problemas.",
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
  const [caseError, setCaseError] = useState("");
  const [cases, setCases] = useState<readonly AgentCase[]>([]);
  const [caseView, setCaseView] = useState(false);
  const [masterCases, setMasterCases] = useState(false);
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([openingMessage]);
  const [showGuides, setShowGuides] = useState(false);
  const [rutyxExpanded, setRutyxExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextMessageId = useRef(2);

  useEffect(() => {
    if (open && activeFunction === "nodalito") inputRef.current?.focus();
  }, [activeFunction, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function refreshCases() {
      try {
        const response = await fetch("/api/agent/nodalito/cases", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { cases?: AgentCase[]; master?: boolean };
        if (!cancelled) { setCases(payload.cases ?? []); setMasterCases(Boolean(payload.master)); }
      } catch { /* Keep the last successful snapshot; the explicit case view shows errors. */ }
    }
    void refreshCases();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshCases(); }, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (rutyxExpanded) setRutyxExpanded(false);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [rutyxExpanded]);

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
        answer?: Readonly<{ findings: readonly NodalitoFinding[]; summary: string; repairPreview?: Message["repairPreview"] }>;
        message?: string;
      };
      setMessages((current) => [...current, payload.answer ? {
        findings: payload.answer.findings,
        repairPreview: payload.answer.repairPreview,
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
    setCaseError("");
    setCaseView(true);
    try {
      const response = await fetch("/api/agent/nodalito/cases", { cache: "no-store" });
      const payload = await response.json() as { cases?: AgentCase[]; master?: boolean; message?: string };
      if (!response.ok) { setCaseError(payload.message ?? "No pude cargar los casos. Volvé a intentar."); return; }
      setCases(payload.cases ?? []);
      setMasterCases(Boolean(payload.master));
    } catch {
      setCaseError("No pude conectar para cargar los casos. Volvé a intentar.");
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

  async function applyRepair(message: Message) {
    if (!message.repairPreview || message.repairCompleted || caseLoading) return;
    setCaseLoading(true);
    try {
      const response = await fetch("/api/agent/nodalito/repairs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "apply", planId: message.repairPreview.planId }),
      });
      const payload = await response.json() as { message?: string };
      if (response.ok) setMessages((current) => current.map((item) => item.id === message.id ? { ...item, repairCompleted: true } : item));
      setMessages((current) => [...current, { id: nextMessageId.current++, role: "agent", text: payload.message ?? "No pude verificar el resultado. Revisá el caso antes de volver a intentar." }]);
    } catch {
      setMessages((current) => [...current, { id: nextMessageId.current++, role: "agent", text: "Se interrumpió la conexión. Podés reintentar esta misma corrección: no se aplicará dos veces." }]);
    } finally { setCaseLoading(false); }
  }

  async function updateCase(agentCase: AgentCase, status: AgentCase["status"]) {
    setCaseLoading(true);
    await fetch("/api/agent/nodalito/cases", {
      body: JSON.stringify({ id: agentCase.id, status }), headers: { "content-type": "application/json" }, method: "PATCH",
    });
    await loadCases();
  }

  async function revertRepair(agentCase: AgentCase) {
    const evidence = repairEvidence(agentCase);
    if (!masterCases || !evidence || caseLoading) return;
    setCaseLoading(true);
    try {
      const response = await fetch("/api/agent/nodalito/repairs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "revert", planId: evidence.planId }) });
      const payload = await response.json() as { message?: string };
      setMessages((current) => [...current, { id: nextMessageId.current++, role: "agent", text: payload.message ?? "No pude verificar la reversión." }]);
      if (response.ok) await loadCases();
      else setCaseView(false);
    } catch {
      setMessages((current) => [...current, { id: nextMessageId.current++, role: "agent", text: "No pude verificar la reversión. Podés reintentar sin duplicarla." }]);
      setCaseView(false);
    } finally { setCaseLoading(false); }
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
      {open && rutyxExpanded ? <button aria-label="Minimizar Rutyx" className={styles.backdrop} onClick={() => setRutyxExpanded(false)} type="button" /> : null}
      {open ? (
        <section aria-label="Nodalito" className={`${styles.panel} ${rutyxExpanded ? styles.rutyxWindow : ""}`} role="dialog">
          <header className={styles.header}>
            <div className={styles.agentIdentity}>
              <span className={styles.headerMascot}>
                <Image alt="" fill sizes="48px" src="/nodalbot.png" />
              </span>
              <div>
                <strong>Nodalito</strong>
                <span><i /> Asistente NODAL</span>
              </div>
            </div>
            <div className={styles.windowControls}>
              {rutyxExpanded ? <button aria-label="Minimizar Rutyx" className={styles.closeButton} onClick={() => setRutyxExpanded(false)} type="button">−</button> : null}
              <button aria-label="Cerrar agente" className={styles.closeButton} onClick={() => { setRutyxExpanded(false); setOpen(false); }} type="button">×</button>
            </div>
          </header>

          {!rutyxExpanded ? <nav aria-label="Funciones de Nodalito" className={styles.functions}>
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
          </nav> : null}

          {activeFunction === "nodalito" ? (
            <div aria-live="polite" className={styles.messages}>
              <div className={styles.agentSubnav}>
                <button aria-current={!caseView ? "page" : undefined} onClick={() => setCaseView(false)} type="button">Conversación</button>
                <button aria-current={caseView ? "page" : undefined} onClick={() => void loadCases()} type="button">Casos{masterCases && cases.some((c) => !c.reviewed_at) ? ` · ${cases.filter((c) => !c.reviewed_at).length}` : ""}</button>
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
                  {message.role === "agent" && message.question ? (
                    <div className={styles.messageActions}>
                      {message.repairPreview ? <div className={styles.repairReview}>
                        <strong>{message.repairPreview.label}</strong>
                        {message.repairPreview.details?.map((detail, index) => <small key={index}>{detail}</small>)}
                        <button className={styles.repairButton} disabled={caseLoading || message.repairCompleted} onClick={() => void applyRepair(message)} type="button">{message.repairCompleted ? "Corregido" : "Confirmar corrección"}</button>
                      </div> : null}
                      {(message.findings?.length ?? 0) > 0 ? (
                        <button className={styles.reportButton} disabled={caseLoading || Boolean(message.reportedCaseId)} onClick={() => void reportMessage(message)} type="button">
                          {message.reportedCaseId ? "Reportado" : "Reportar"}
                        </button>
                      ) : null}
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
              </> : (
                <div className={styles.caseList}>
                  <p className={styles.caseHeading}>{masterCases ? "Bandeja de revisiones" : "Mis casos y reparaciones"}</p>
                  {caseLoading && !cases.length ? <p className={styles.thinking}>Cargando casos…</p> : null}
                  {caseError ? <p role="alert" className={styles.emptyCases}>{caseError}</p> : null}
                  {!caseLoading && !caseError && !cases.length ? <p className={styles.emptyCases}>Todavía no hay casos reportados.</p> : null}
                  {cases.map((agentCase) => (
                    <article data-priority={agentCase.priority} key={agentCase.id}>
                      <div><strong>{agentCase.title}</strong><span>{agentCase.status === "open" ? "Revisión requerida" : agentCase.status === "investigating" ? "En revisión" : agentCase.status === "resolved" ? "Resuelto" : "Descartado"}</span></div>
                      {masterCases && agentCase.nodal_users ? <small>{agentCase.nodal_users.display_name || agentCase.nodal_users.email}</small> : null}
                      <p>{agentCase.description}</p>
                      {repairEvidence(agentCase) ? <details><summary>Detalle de la corrección</summary>{[...repairSummary(repairEvidence(agentCase)!.parameters), ...repairEvidence(agentCase)!.changes].map((line, index) => <p key={index}>{line}</p>)}<p>{agentCase.resolution_note}</p></details> : null}
                      {masterCases && agentCase.category === "nodalito_repair" && !repairEvidence(agentCase)?.reverted ? <button disabled={caseLoading} onClick={() => void revertRepair(agentCase)} type="button">Revertir corrección</button> : null}
                      {masterCases && agentCase.status === "resolved" && !agentCase.reviewed_at ? <button disabled={caseLoading} onClick={() => void updateCase(agentCase, "resolved")} type="button">Marcar como auditado</button> : null}
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
            <RutyxNavigator expanded={rutyxExpanded} onExpand={() => setRutyxExpanded(true)} />
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
        onClick={() => { setRutyxExpanded(false); setOpen((current) => !current); }}
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
