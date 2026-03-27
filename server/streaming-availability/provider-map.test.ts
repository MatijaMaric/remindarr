import { describe, it, expect } from "bun:test";
import { SA_TO_TMDB_PROVIDER, mapSAMonetizationType } from "./provider-map";

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
