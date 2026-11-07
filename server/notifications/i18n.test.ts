import { describe, expect, it } from "bun:test";
import {
  CATALOGS,
  NOTIFICATION_LANGUAGES,
  getTranslator,
  resolveNotificationLanguage,
} from "./i18n";
import { formatLeavingCopy } from "./content";
import { formatPersonCredit } from "./format";

describe("resolveNotificationLanguage", () => {
  it("maps supported tags by base language", () => {
    expect(resolveNotificationLanguage("de")).toBe("de");
    expect(resolveNotificationLanguage("pt-BR")).toBe("pt");
    expect(resolveNotificationLanguage("FR")).toBe("fr");
    expect(resolveNotificationLanguage("ja_JP")).toBe("ja");
  });

  it("falls back to English for unknown, empty or null locales", () => {
    expect(resolveNotificationLanguage(null)).toBe("en");
    expect(resolveNotificationLanguage(undefined)).toBe("en");
    expect(resolveNotificationLanguage("")).toBe("en");
    expect(resolveNotificationLanguage("zz")).toBe("en");
    expect(getTranslator("xx-YY").count("episodes", 2)).toBe("2 episodes");
  });
});

describe("catalog completeness", () => {
  const enKeys = Object.keys(CATALOGS.en).sort();

  for (const lang of NOTIFICATION_LANGUAGES) {
    it(`${lang} defines every key with an "other" plural form`, () => {
      const catalog = CATALOGS[lang];
      expect(Object.keys(catalog).sort()).toEqual(enKeys);
      for (const key of enKeys) {
        const enMsg = CATALOGS.en[key as keyof typeof CATALOGS.en];
        const msg = catalog[key as keyof typeof catalog];
        expect(typeof msg).toBe(typeof enMsg);
        if (typeof msg === "object") {
          expect(msg.other).toContain("{n}");
        }
      }
    });
  }
});

describe("plural forms", () => {
  it("uses one/other in English", () => {
    const tr = getTranslator("en");
    expect(tr.count("episodes", 1)).toBe("1 episode");
    expect(tr.count("episodes", 0)).toBe("0 episodes");
    expect(tr.count("movies", 3)).toBe("3 movies");
    expect(tr.count("nowStreamingCount", 1)).toBe("1 now streaming");
  });

  it("treats 0 as singular in French", () => {
    const tr = getTranslator("fr");
    expect(tr.count("episodes", 0)).toBe("0 épisode");
    expect(tr.count("episodes", 2)).toBe("2 épisodes");
    // "many" category (1,000,000) falls back to "other"
    expect(tr.count("movies", 1000000)).toBe("1000000 films");
  });

  it("pluralizes German", () => {
    const tr = getTranslator("de");
    expect(tr.count("episodes", 1)).toBe("1 Folge");
    expect(tr.count("episodes", 4)).toBe("4 Folgen");
    expect(tr.count("newBadges", 2)).toBe("2 neue Abzeichen");
  });

  it("uses the single Japanese form for every count", () => {
    const tr = getTranslator("ja");
    expect(tr.count("episodes", 1)).toBe("エピソード1件");
    expect(tr.count("episodes", 5)).toBe("エピソード5件");
  });

  it("joins parts with the language's conjunction", () => {
    expect(getTranslator("en").join(["1 episode", "2 movies"])).toBe(
      "1 episode and 2 movies",
    );
    expect(getTranslator("es").join(["a", "b"])).toBe("a y b");
    expect(getTranslator("ja").join(["a", "b"])).toBe("a、b");
  });
});

describe("localized helpers", () => {
  it("formatLeavingCopy keeps English output and localizes dates", () => {
    expect(formatLeavingCopy("Netflix", "2025-06-01")).toBe(
      "Leaving Netflix on Jun 1, 2025",
    );
    expect(formatLeavingCopy("Netflix", null, "es")).toBe(
      "Sale pronto de Netflix",
    );
    expect(formatLeavingCopy("Netflix", "2025-06-01", "de")).toBe(
      "Ab 1. Juni 2025 nicht mehr bei Netflix",
    );
    expect(formatLeavingCopy("Netflix", "2025-06-01", "ja")).toBe(
      "2025年6月1日にNetflixで配信終了",
    );
    expect(formatLeavingCopy("Netflix", "not-a-date", "fr")).toBe(
      "Quitte bientôt Netflix",
    );
  });

  it("formatPersonCredit localizes the role connector", () => {
    const pc = {
      personName: "Greta Gerwig",
      title: "Narnia",
      role: "Director",
      releaseDate: "2026-11-26",
      posterUrl: null,
    };
    expect(formatPersonCredit(pc)).toBe(
      "Greta Gerwig: Narnia (2026) as Director",
    );
    expect(formatPersonCredit(pc, "pt-BR")).toBe(
      "Greta Gerwig: Narnia (2026) como Director",
    );
  });
});
