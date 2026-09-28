import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "remindarr:language";

const SUPPORTED_CODES: readonly string[] = SUPPORTED_LANGUAGES.map(
  (l) => l.code,
);

// Non-English bundles are split into their own chunks and loaded on demand so
// English-only users don't download every translation.
const loaders: Record<
  Exclude<LanguageCode, "en">,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  es: () => import("./locales/es.json"),
  de: () => import("./locales/de.json"),
  fr: () => import("./locales/fr.json"),
  pt: () => import("./locales/pt.json"),
  ja: () => import("./locales/ja.json"),
};

/** Map a BCP 47 tag (e.g. "pt-BR", "de") to a supported UI language, or null. */
export function resolveLanguage(
  tag: string | null | undefined,
): LanguageCode | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(base) ? (base as LanguageCode) : null;
}

function readStoredLanguage(): LanguageCode | null {
  try {
    return resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Saved choice first, then the browser's preferred languages, then English. */
export function detectLanguage(): LanguageCode {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const candidates = nav?.languages?.length
    ? nav.languages
    : [nav?.language ?? ""];
  for (const tag of candidates) {
    const lang = resolveLanguage(tag);
    if (lang) return lang;
  }
  return "en";
}

async function ensureLoaded(code: LanguageCode): Promise<void> {
  if (code === "en" || i18n.hasResourceBundle(code, "translation")) return;
  const mod = await loaders[code]();
  i18n.addResourceBundle(code, "translation", mod.default, true, true);
}

i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Switch the UI language. Loads the bundle if needed and remembers the choice
 * on this device.
 */
export async function setLanguage(code: string): Promise<void> {
  const lang = resolveLanguage(code) ?? "en";
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Storage may be unavailable (private mode) — the switch still applies.
  }
  await ensureLoaded(lang);
  await i18n.changeLanguage(lang);
}

/** The active UI language, for Intl APIs that should match UI text. */
export function currentLanguage(): LanguageCode {
  return resolveLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";
}

const initial = detectLanguage();
export const i18nReady: Promise<void> =
  initial === "en"
    ? Promise.resolve()
    : ensureLoaded(initial)
        .then(() => i18n.changeLanguage(initial))
        .then(() => undefined)
        .catch(() => undefined);

export default i18n;
