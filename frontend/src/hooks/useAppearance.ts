import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getAppearanceSettings, updateAppearanceSettings } from "../api";
import type { AppearanceSettings } from "../types";

const STORAGE_KEY = "remindarr-appearance";

const DEFAULTS: AppearanceSettings = {
  themeVariant: "dark",
  accentColor: "amber",
  density: "comfortable",
  reduceMotion: 0,
  highContrast: 0,
  hideEpisodeSpoilers: 0,
  autoplayTrailers: 0,
};

function loadCached(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveCache(settings: AppearanceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage full — silently ignore
  }
}

export function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement;

  root.setAttribute("data-accent", settings.accentColor);
  root.setAttribute("data-density", settings.density);

  if (settings.reduceMotion) {
    root.classList.add("motion-reduce");
  } else {
    root.classList.remove("motion-reduce");
  }

  if (settings.highContrast) {
    root.classList.add("high-contrast");
  } else {
    root.classList.remove("high-contrast");
  }
}

/** Applies cached appearance immediately on module load (before React mounts). */
if (typeof window !== "undefined") {
  applyAppearance(loadCached());
}

/**
 * Fetches appearance settings from the server when the user is authenticated
 * and applies them to the document root. Falls back to cached values if the
 * fetch fails or the user is not logged in.
 */
export function useAppearance(): {
  settings: AppearanceSettings;
  update: (patch: Partial<AppearanceSettings>) => Promise<void>;
} {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppearanceSettings>(loadCached);

  const applyAndSet = useCallback((s: AppearanceSettings) => {
    setSettings(s);
    saveCache(s);
    applyAppearance(s);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getAppearanceSettings().then((data) => {
      if (!cancelled) applyAndSet(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, applyAndSet]);

  const update = useCallback(async (patch: Partial<AppearanceSettings>) => {
    applyAndSet({ ...settings, ...patch });
    const saved = await updateAppearanceSettings(patch);
    applyAndSet(saved);
  }, [settings, applyAndSet]);

  return { settings, update };
}
