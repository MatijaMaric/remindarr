import { useState, useEffect } from "react";

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
  const stored = localStorage.getItem(STORAGE_KEY);
  return isValidTheme(stored) ? stored : "dark";
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return getStoredTheme();
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(newTheme: Theme) {
    localStorage.setItem(STORAGE_KEY, newTheme);
    setThemeState(newTheme);
    applyTheme(newTheme);
  }

  return { theme, setTheme };
}
