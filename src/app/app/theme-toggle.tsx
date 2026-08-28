"use client";

import { useEffect, useSyncExternalStore } from "react";

import { WorkspaceIcon } from "./workspace-icon";

type Theme = "day" | "night";

const storageKey = "nodal-app-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function getStoredTheme(): Theme {
  return window.localStorage.getItem(storageKey) === "day" ? "day" : "night";
}

function subscribeToThemeChange(callback: () => void) {
  window.addEventListener("nodal-theme-change", callback);
  return () => window.removeEventListener("nodal-theme-change", callback);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(
    subscribeToThemeChange,
    getStoredTheme,
    () => "night",
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function changeTheme(nextTheme: Theme) {
    window.localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event("nodal-theme-change"));
  }

  return (
    <div aria-label="Tema visual" className="theme-toggle" role="group">
      <button aria-label="Usar modo nocturno" aria-pressed={theme === "night"} onClick={() => changeTheme("night")} title="Modo nocturno" type="button">
        <WorkspaceIcon name="moon" />
      </button>
      <button aria-label="Usar modo diurno" aria-pressed={theme === "day"} onClick={() => changeTheme("day")} title="Modo diurno" type="button">
        <WorkspaceIcon name="sun" />
      </button>
    </div>
  );
}
