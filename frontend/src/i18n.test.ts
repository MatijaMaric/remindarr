import { afterEach, describe, expect, it } from "bun:test";
import en from "./locales/en.json";
import i18n, {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  currentLanguage,
  detectLanguage,
  resolveLanguage,
  setLanguage,
} from "./i18n";

const originalLanguages = Object.getOwnPropertyDescriptor(
  navigator,
  "languages",
);

function mockNavigatorLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
}

afterEach(async () => {
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  if (originalLanguages) {
    Object.defineProperty(navigator, "languages", originalLanguages);
  } else {
    delete (navigator as { languages?: unknown }).languages;
  }
  await i18n.changeLanguage("en");
});

describe("resolveLanguage", () => {
  it("maps regional tags to the supported base language", () => {
    expect(resolveLanguage("pt-BR")).toBe("pt");
    expect(resolveLanguage("de_AT")).toBe("de");
    expect(resolveLanguage("JA")).toBe("ja");
  });

  it("returns null for unsupported or missing tags", () => {
    expect(resolveLanguage("hr")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
    expect(resolveLanguage(undefined)).toBeNull();
  });
});

describe("detectLanguage", () => {
  it("prefers the saved choice over the browser language", () => {
    mockNavigatorLanguages(["fr-FR"]);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ja");
    expect(detectLanguage()).toBe("ja");
  });

  it("uses the first supported browser language", () => {
    mockNavigatorLanguages(["hr-HR", "es-MX", "en-US"]);
    expect(detectLanguage()).toBe("es");
  });

  it("ignores an unsupported saved value", () => {
    mockNavigatorLanguages(["de-DE"]);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "klingon");
    expect(detectLanguage()).toBe("de");
  });

  it("falls back to English", () => {
    mockNavigatorLanguages(["hr-HR"]);
    expect(detectLanguage()).toBe("en");
  });
});

describe("setLanguage", () => {
  it("loads the bundle, switches the UI, and remembers the choice", async () => {
    await setLanguage("de");

    expect(i18n.language).toBe("de");
    expect(currentLanguage()).toBe("de");
    expect(i18n.t("nav.settings")).toBe("Einstellungen");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("normalizes regional codes", async () => {
    await setLanguage("pt-BR");
    expect(i18n.language).toBe("pt");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("pt");
  });

  it("falls back to English for unsupported codes", async () => {
    await setLanguage("de");
    await setLanguage("xx");
    expect(i18n.language).toBe("en");
    expect(i18n.t("nav.settings")).toBe("Settings");
  });

  it("uses language-specific plural rules", async () => {
    await setLanguage("fr");
    expect(i18n.t("season.episodeCount", { count: 1 })).toBe("1 épisode");
    expect(i18n.t("season.episodeCount", { count: 3 })).toBe("3 épisodes");

    await setLanguage("ja");
    expect(i18n.t("season.episodeCount", { count: 1 })).toBe("1 エピソード");
  });

  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))(
    "switches to %s",
    async (code) => {
      await setLanguage(code);
      expect(i18n.language).toBe(code);
      expect(i18n.hasResourceBundle(code, "translation")).toBe(true);
    },
  );
});

describe("i18n", () => {
  it("initializes with English as default", () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it("translates basic keys", () => {
    const result = i18n.t("nav.home");
    expect(result).toBe("Home");
  });

  it("translates with interpolation", () => {
    const result = i18n.t("home.season", { number: 3 });
    expect(result).toBe("Season 3");
  });

  it("has all required top-level namespaces", () => {
    const requiredNamespaces = [
      "nav",
      "bottomNav",
      "home",
      "tracked",
      "upcoming",
      "browse",
      "login",
      "profile",
      "filter",
      "search",
      "releases",
      "track",
      "episodes",
      "calendar",
      "common",
    ];
    for (const ns of requiredNamespaces) {
      expect(en).toHaveProperty(ns);
    }
  });

  it("falls back gracefully for missing keys", () => {
    const result = i18n.t("nonexistent.key");
    expect(result).toBe("nonexistent.key");
  });

  it("translates login fields", () => {
    expect(i18n.t("login.username")).toBe("Username");
    expect(i18n.t("login.password")).toBe("Password");
    expect(i18n.t("login.signIn")).toBe("Sign In");
  });

  it("translates track button states", () => {
    expect(i18n.t("track.track")).toBe("Add to watchlist");
    expect(i18n.t("track.tracked")).toBe("In watchlist");
  });

  it("translates filter labels", () => {
    expect(i18n.t("filter.all")).toBe("All");
    expect(i18n.t("filter.movies")).toBe("Movies");
    expect(i18n.t("filter.shows")).toBe("Shows");
  });

  it("translates episodes labels", () => {
    expect(i18n.t("episodes.tomorrow")).toBe("Tomorrow");
    expect(i18n.t("episodes.markAsWatched")).toBe("Mark as watched");
    expect(i18n.t("episodes.markAsUnwatched")).toBe("Mark as unwatched");
  });

  it("handles interpolation in login failed message", () => {
    const result = i18n.t("login.loginFailed", {
      error: "invalid credentials",
    });
    expect(result).toBe("Login failed: invalid credentials");
  });
});
