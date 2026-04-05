import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "oled";

const STORAGE_KEY = "remindarr-theme";
const VALID_THEMES: Theme[] = ["dark", "light", "oled"];

function isValidTheme(value: string | null): value is Theme {
  return VALID_THEMES.includes(value as Theme);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const t of VALID_THEMES) {
    root.classList.remove(`theme-${t}`);
  }
  root.classList.add(`theme-${theme}`);
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

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, getStoredTheme);

  function setTheme(newTheme: Theme) {
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    listeners.forEach((fn) => fn());
  }

  return { theme, setTheme };
}
