import { describe, expect, test } from "bun:test";
import {
  ADVISORY_LEVELS,
  advisoryAction,
  certificationRank,
  type AdvisoryLevel,
  type AdvisorySettings,
} from "./contentAdvisory";

const none: AdvisorySettings = { level: "none", allowlist: [] };
const mild: AdvisorySettings = { level: "mild", allowlist: [] };
const moderate: AdvisorySettings = { level: "moderate", allowlist: [] };
const strict: AdvisorySettings = { level: "strict", allowlist: [] };

describe("certificationRank", () => {
  test("maps family ratings to 0", () => {
    expect(certificationRank("G")).toBe(0);
    expect(certificationRank("TV-Y")).toBe(0);
    expect(certificationRank("TV-Y7")).toBe(0);
    expect(certificationRank("TV-G")).toBe(0);
    expect(certificationRank("U")).toBe(0);
  });

  test("maps PG / TV-PG to 1", () => {
    expect(certificationRank("PG")).toBe(1);
    expect(certificationRank("TV-PG")).toBe(1);
    expect(certificationRank("pg")).toBe(1);
  });

  test("maps PG-13 / TV-14 to 2", () => {
    expect(certificationRank("PG-13")).toBe(2);
    expect(certificationRank("TV-14")).toBe(2);
    expect(certificationRank("12A")).toBe(2);
  });

  test("maps R / TV-MA to 3", () => {
    expect(certificationRank("R")).toBe(3);
    expect(certificationRank("TV-MA")).toBe(3);
    expect(certificationRank("15")).toBe(3);
    expect(certificationRank("MA15+")).toBe(3);
  });

  test("maps NC-17 and adult ratings to 4", () => {
    expect(certificationRank("NC-17")).toBe(4);
    expect(certificationRank("NC17")).toBe(4);
    expect(certificationRank("18+")).toBe(4);
    expect(certificationRank("R18+")).toBe(4);
    expect(certificationRank("X")).toBe(4);
  });

  test("returns null for missing or unknown ratings", () => {
    expect(certificationRank(null)).toBeNull();
    expect(certificationRank(undefined)).toBeNull();
    expect(certificationRank("")).toBeNull();
    expect(certificationRank("NR")).toBeNull();
    expect(certificationRank("Not Rated")).toBeNull();
    expect(certificationRank("??")).toBeNull();
  });
});

describe("advisoryAction", () => {
  test("none shows every rating", () => {
    for (const cert of ["G", "PG-13", "R", "NC-17", null]) {
      expect(advisoryAction(cert, "movie-1", none)).toBe("show");
    }
  });

  test("mild blurs R / TV-MA / NC-17 and shows everything else", () => {
    expect(advisoryAction("G", "movie-1", mild)).toBe("show");
    expect(advisoryAction("PG-13", "movie-1", mild)).toBe("show");
    expect(advisoryAction("R", "movie-1", mild)).toBe("blur");
    expect(advisoryAction("TV-MA", "tv-1", mild)).toBe("blur");
    expect(advisoryAction("NC-17", "movie-1", mild)).toBe("blur");
    expect(advisoryAction(null, "movie-1", mild)).toBe("show");
  });

  test("moderate hides R / TV-MA / NC-17 and shows PG-13 and below", () => {
    expect(advisoryAction("PG-13", "movie-1", moderate)).toBe("show");
    expect(advisoryAction("TV-14", "tv-1", moderate)).toBe("show");
    expect(advisoryAction("R", "movie-1", moderate)).toBe("hide");
    expect(advisoryAction("TV-MA", "tv-1", moderate)).toBe("hide");
    expect(advisoryAction("NC-17", "movie-1", moderate)).toBe("hide");
    expect(advisoryAction(null, "movie-1", moderate)).toBe("show");
  });

  test("strict hides PG-13 / TV-14 and above", () => {
    expect(advisoryAction("G", "movie-1", strict)).toBe("show");
    expect(advisoryAction("PG", "movie-1", strict)).toBe("show");
    expect(advisoryAction("TV-PG", "tv-1", strict)).toBe("show");
    expect(advisoryAction("PG-13", "movie-1", strict)).toBe("hide");
    expect(advisoryAction("TV-14", "tv-1", strict)).toBe("hide");
    expect(advisoryAction("R", "movie-1", strict)).toBe("hide");
    expect(advisoryAction(null, "movie-1", strict)).toBe("show");
  });

  test("allowlist shows a title that would otherwise be hidden or blurred", () => {
    const allowed: AdvisorySettings = {
      level: "strict",
      allowlist: ["movie-1"],
    };
    expect(advisoryAction("R", "movie-1", allowed)).toBe("show");
    expect(advisoryAction("R", "movie-2", allowed)).toBe("hide");
  });

  test("allowlist does not disable the global filter for other titles", () => {
    const allowed: AdvisorySettings = {
      level: "moderate",
      allowlist: ["tv-9"],
    };
    expect(advisoryAction("TV-MA", "tv-9", allowed)).toBe("show");
    expect(advisoryAction("TV-MA", "tv-8", allowed)).toBe("hide");
    expect(advisoryAction("PG", "tv-8", allowed)).toBe("show");
  });
});

describe("ADVISORY_LEVELS", () => {
  test("includes the four per-user levels", () => {
    expect(ADVISORY_LEVELS).toEqual(["none", "mild", "moderate", "strict"]);
  });

  test("rejects unknown levels at the type boundary via runtime guard", () => {
    const isLevel = (v: string): v is AdvisoryLevel =>
      (ADVISORY_LEVELS as readonly string[]).includes(v);
    expect(isLevel("none")).toBe(true);
    expect(isLevel("kids")).toBe(false);
  });
});
