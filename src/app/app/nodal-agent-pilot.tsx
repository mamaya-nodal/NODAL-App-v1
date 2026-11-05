"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";

import styles from "./nodal-agent-pilot.module.css";

type Message = Readonly<{
  id: number;
  role: "agent" | "user";
  text: string;
}>;

type AgentFunction = "nodalito" | "rutyx";

const openingMessage: Message = {
  id: 1,
  role: "agent",
  text: "Hola, Mauricio. Soy Nodalito. En este piloto podés probar mi interfaz y contarme qué querés revisar.",
};

export function NodalAgentPilot() {
  const [activeFunction, setActiveFunction] = useState<AgentFunction>("nodalito");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([openingMessage]);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const nextId = Date.now();
    setMessages((current) => [
      ...current,
      { id: nextId, role: "user", text },
      {
        id: nextId + 1,
        role: "agent",
        text: "Recibí tu mensaje. En esta prueba visual todavía no consulto la base ni envío reparaciones al Agente Admin Master.",
      },
    ]);
    setDraft("");
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
                <span><i /> Piloto visual</span>
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
              <p className={styles.pilotNotice}>Esta versión todavía no modifica datos ni ejecuta reparaciones.</p>
              {messages.map((message) => (
                <p className={message.role === "user" ? styles.userMessage : styles.agentMessage} key={message.id}>
                  {message.text}
                </p>
              ))}
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
              <button aria-label="Enviar mensaje" disabled={!draft.trim()} type="submit">↑</button>
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
