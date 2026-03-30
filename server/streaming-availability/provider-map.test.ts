import { describe, it, expect } from "bun:test";
import { SA_TO_TMDB_PROVIDER, mapSAMonetizationType, canonicalProviderId } from "./provider-map";

describe("canonicalProviderId", () => {
  it("collapses HBO Max hbo_max (1899) to hbo (384)", () => {
    expect(canonicalProviderId(1899)).toBe(384);
  });

  it("collapses Amazon Prime Video (119) to Prime Video (9)", () => {
    expect(canonicalProviderId(119)).toBe(9);
  });

  it("returns the same ID for non-duplicate providers", () => {
    expect(canonicalProviderId(8)).toBe(8);   // Netflix
    expect(canonicalProviderId(337)).toBe(337); // Disney+
    expect(canonicalProviderId(384)).toBe(384); // HBO Max canonical
    expect(canonicalProviderId(9)).toBe(9);   // Prime Video canonical
  });
});

describe("SA_TO_TMDB_PROVIDER", () => {
  it("maps common streaming services", () => {
    expect(SA_TO_TMDB_PROVIDER.get("netflix")).toBe(8);
    expect(SA_TO_TMDB_PROVIDER.get("disney")).toBe(337);
    expect(SA_TO_TMDB_PROVIDER.get("hbo")).toBe(384);
    expect(SA_TO_TMDB_PROVIDER.get("prime")).toBe(9);
    expect(SA_TO_TMDB_PROVIDER.get("apple")).toBe(350);
  });

  it("returns undefined for unknown services", () => {
    expect(SA_TO_TMDB_PROVIDER.get("unknown_service")).toBeUndefined();
  });
});

describe("mapSAMonetizationType", () => {
  it("maps subscription to FLATRATE", () => {
    expect(mapSAMonetizationType("subscription")).toBe("FLATRATE");
  });

  it("maps free to FREE", () => {
    expect(mapSAMonetizationType("free")).toBe("FREE");
  });

  it("maps addon to ADS", () => {
    expect(mapSAMonetizationType("addon")).toBe("ADS");
  });

  it("maps rent to RENT", () => {
    expect(mapSAMonetizationType("rent")).toBe("RENT");
  });

  it("maps buy to BUY", () => {
    expect(mapSAMonetizationType("buy")).toBe("BUY");
  });

  it("defaults to FLATRATE for unknown types", () => {
    expect(mapSAMonetizationType("whatever")).toBe("FLATRATE");
  });
});
