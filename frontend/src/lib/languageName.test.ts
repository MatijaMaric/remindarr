import { describe, expect, it } from "bun:test";
import { languageName } from "./languageName";

describe("languageName", () => {
  it("renders the language name in the UI language", () => {
    expect(languageName("ja", "en")).toBe("Japanese");
    expect(languageName("ja", "de")).toBe("Japanisch");
    expect(languageName("de", "fr")).toBe("allemand");
  });

  it("returns null for codes without a known name", () => {
    expect(languageName("xx", "en")).toBeNull();
  });

  it("returns null instead of throwing on malformed codes", () => {
    expect(languageName("", "en")).toBeNull();
  });
});
