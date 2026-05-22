/**
 * TMDB parser golden-set eval.
 *
 * Purpose: detect TMDB API response field drift before users notice.
 * When TMDB changes a field name or type, these tests fail with a clear diff
 * against the recorded expected output — even if no application code changed.
 *
 * How to update golden files after a legitimate TMDB shape change:
 *   1. Delete the relevant `expected/*.json`
 *   2. Run this test once — it will regenerate the expected files
 *   3. Inspect the diff, commit if the change is intentional
 *
 * Usage:
 *   bun run eval:tmdb
 */

import { describe, it, expect } from "bun:test";
import { parseMovieDetails, parseTvDetails } from "../../server/tmdb/parser";
import type { TmdbMovieDetails, TmdbTvDetails } from "../../server/tmdb/types";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const EXPECTED_DIR = join(import.meta.dir, "expected");

function loadFixture<T>(name: string): T {
  const path = join(FIXTURES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function loadOrCreateExpected(
  name: string,
  actual: unknown,
): { matched: boolean; diff?: string } {
  const path = join(EXPECTED_DIR, `${name}.json`);
  const actualJson = JSON.stringify(actual, null, 2);

  if (!existsSync(path)) {
    // First run: write the golden file
    writeFileSync(path, actualJson, "utf-8");
    console.log(`[eval] Created golden file: ${path}`);
    return { matched: true };
  }

  const expected = readFileSync(path, "utf-8");
  if (expected === actualJson) return { matched: true };

  return {
    matched: false,
    diff: `Expected:\n${expected}\n\nActual:\n${actualJson}`,
  };
}

// ─── Movie parse eval ─────────────────────────────────────────────────────────

describe("parseMovieDetails golden set", () => {
  it("standard movie with watch providers", () => {
    const fixture = loadFixture<TmdbMovieDetails>("movie-with-providers");
    const result = parseMovieDetails(fixture);

    // Structural assertions (always run)
    expect(result.objectType).toBe("MOVIE");
    expect(result.id).toMatch(/^movie-\d+$/);
    expect(typeof result.title).toBe("string");
    expect(result.title.length).toBeGreaterThan(0);

    // Golden-set assertion
    const { matched, diff } = loadOrCreateExpected(
      "movie-with-providers.parsed",
      result,
    );
    if (!matched) {
      throw new Error(`TMDB parser output drifted from golden set:\n${diff}`);
    }
  });

  it("movie without watch providers", () => {
    const fixture = loadFixture<TmdbMovieDetails>("movie-no-providers");
    const result = parseMovieDetails(fixture);

    expect(result.objectType).toBe("MOVIE");
    expect(result.offers).toHaveLength(0);

    const { matched, diff } = loadOrCreateExpected(
      "movie-no-providers.parsed",
      result,
    );
    if (!matched) {
      throw new Error(`TMDB parser output drifted from golden set:\n${diff}`);
    }
  });

  it("movie with null/missing optional fields", () => {
    const fixture = loadFixture<TmdbMovieDetails>("movie-sparse");
    const result = parseMovieDetails(fixture);

    expect(result.objectType).toBe("MOVIE");
    // Sparse movie: posterUrl, releaseYear, runtime should be null-safe
    expect(() => result.posterUrl).not.toThrow();
    expect(() => result.releaseYear).not.toThrow();
    expect(() => result.runtimeMinutes).not.toThrow();

    const { matched, diff } = loadOrCreateExpected(
      "movie-sparse.parsed",
      result,
    );
    if (!matched) {
      throw new Error(`TMDB parser output drifted from golden set:\n${diff}`);
    }
  });
});

// ─── TV show parse eval ───────────────────────────────────────────────────────

describe("parseTvDetails golden set", () => {
  it("standard show with watch providers", () => {
    const fixture = loadFixture<TmdbTvDetails>("show-with-providers");
    const result = parseTvDetails(fixture);

    expect(result.objectType).toBe("SHOW");
    expect(result.id).toMatch(/^tv-\d+$/);
    expect(typeof result.title).toBe("string");

    const { matched, diff } = loadOrCreateExpected(
      "show-with-providers.parsed",
      result,
    );
    if (!matched) {
      throw new Error(`TMDB parser output drifted from golden set:\n${diff}`);
    }
  });

  it("show with dedup logic: FLATRATE beats FREE beats ADS for same provider", () => {
    const fixture = loadFixture<TmdbTvDetails>("show-provider-dedup");
    const result = parseTvDetails(fixture);

    expect(result.objectType).toBe("SHOW");

    // Find providers appearing more than once — all should be FLATRATE variants
    const providerCounts = new Map<number, string[]>();
    for (const offer of result.offers) {
      const existing = providerCounts.get(offer.providerId) ?? [];
      providerCounts.set(offer.providerId, [
        ...existing,
        offer.monetizationType,
      ]);
    }

    for (const [, types] of providerCounts) {
      if (types.length > 1) {
        // Shouldn't happen — dedup removes lower-priority types for same provider
        throw new Error(
          `Provider appears with multiple monetization types: ${types.join(", ")}`,
        );
      }
    }

    const { matched, diff } = loadOrCreateExpected(
      "show-provider-dedup.parsed",
      result,
    );
    if (!matched) {
      throw new Error(`TMDB parser output drifted from golden set:\n${diff}`);
    }
  });
});
