/**
 * Localized display name for an ISO 639 language code (e.g. "ja" →
 * "Japanese" / "Japanisch"), rendered in the active UI language. Returns null
 * when the runtime has no name for the code.
 */
export function languageName(code: string, uiLanguage: string): string | null {
  try {
    return (
      new Intl.DisplayNames([uiLanguage, "en"], {
        type: "language",
        fallback: "none",
      }).of(code) ?? null
    );
  } catch {
    return null;
  }
}
