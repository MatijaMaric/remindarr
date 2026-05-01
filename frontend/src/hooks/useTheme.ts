import { useSyncExternalStore, useEffect } from "react";

export type Theme = "dark" | "light" | "oled" | "midnight" | "moss" | "plum" | "auto";

const STORAGE_KEY = "remindarr-theme";
const VALID_THEMES: Theme[] = ["dark", "light", "oled", "midnight", "moss", "plum", "auto"];
const BASE_THEMES: Theme[] = [...VALID_THEMES];

export function isValidTheme(value: string | null): value is Theme {
  return BASE_THEMES.includes(value as Theme);
}

/** Resolves "auto" to dark or light based on prefers-color-scheme. */
function resolveAutoTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const t of VALID_THEMES) {
    root.classList.remove(`theme-${t}`);
  }
  if (theme === "auto") {
    const resolved = resolveAutoTheme();
    root.classList.add(`theme-${resolved}`);
  } else {
    root.classList.add(`theme-${theme}`);
  }
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  return isValidTheme(stored) ? stored : "dark";
}

// Module-level subscriber registry so all useTheme() callers share the same state.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function setTheme(newTheme: Theme) {
  localStorage.setItem(STORAGE_KEY, newTheme);
  applyTheme(newTheme);
  listeners.forEach((fn) => fn());
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, getStoredTheme);

  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      applyTheme("auto");
      listeners.forEach((fn) => fn());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
