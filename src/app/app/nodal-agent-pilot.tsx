"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";

import styles from "./nodal-agent-pilot.module.css";

type Message = Readonly<{
  id: number;
  role: "agent" | "user";
  text: string;
}>;

const openingMessage: Message = {
  id: 1,
  role: "agent",
  text: "Hola, Mauricio. Soy el futuro agente de NODAL. En este piloto podés probar mi interfaz y contarme qué querés revisar.",
};

export function NodalAgentPilot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([openingMessage]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
        <section aria-label="Agente NODAL" className={styles.panel} role="dialog">
          <header className={styles.header}>
            <div className={styles.agentIdentity}>
              <span className={styles.headerMascot}>
                <Image alt="" fill sizes="48px" src="/nodalbot.png" />
              </span>
              <div>
                <strong>Agente NODAL</strong>
                <span><i /> Piloto visual</span>
              </div>
            </div>
            <button aria-label="Cerrar agente" className={styles.closeButton} onClick={() => setOpen(false)} type="button">×</button>
          </header>

          <div aria-live="polite" className={styles.messages}>
            <p className={styles.pilotNotice}>Esta versión todavía no modifica datos ni ejecuta reparaciones.</p>
            {messages.map((message) => (
              <p className={message.role === "user" ? styles.userMessage : styles.agentMessage} key={message.id}>
                {message.text}
              </p>
            ))}
          </div>

          <form className={styles.composer} onSubmit={submitMessage}>
            <input
              aria-label="Mensaje para el agente"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribí un mensaje..."
              ref={inputRef}
              value={draft}
            />
            <button aria-label="Enviar mensaje" disabled={!draft.trim()} type="submit">↑</button>
          </form>
        </section>
      ) : null}

      <button
        aria-expanded={open}
        aria-label={open ? "Cerrar Agente NODAL" : "Abrir Agente NODAL"}
        className={styles.launcher}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={styles.launcherGlow} />
        <span className={styles.launcherImage}>
          <Image alt="Agente NODAL" fill priority sizes="76px" src="/nodalbot.png" />
        </span>
        {!open ? <span className={styles.statusDot} /> : null}
      </button>
    </div>
  );
}
