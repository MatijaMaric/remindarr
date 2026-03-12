import { describe, it, expect } from "bun:test";
import { extractImdbId } from "./resolver";

describe("extractImdbId", () => {
  it("extracts ID from full IMDB URL", () => {
    expect(extractImdbId("https://www.imdb.com/title/tt1234567")).toBe("tt1234567");
  });

  it("extracts ID from URL without www", () => {
    expect(extractImdbId("https://imdb.com/title/tt1234567")).toBe("tt1234567");
  });

  it("extracts ID from URL with trailing path", () => {
    expect(extractImdbId("https://www.imdb.com/title/tt1234567/reviews")).toBe("tt1234567");
  });

  it("extracts ID from http URL", () => {
    expect(extractImdbId("http://www.imdb.com/title/tt9876543")).toBe("tt9876543");
  });

  it("extracts bare IMDB ID", () => {
    expect(extractImdbId("tt1234567")).toBe("tt1234567");
  });

  it("trims whitespace from bare ID", () => {
    expect(extractImdbId("  tt1234567  ")).toBe("tt1234567");
  });

  it("returns null for invalid input", () => {
    expect(extractImdbId("not an imdb id")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractImdbId("")).toBeNull();
  });

  it("returns null for random URL", () => {
    expect(extractImdbId("https://example.com/something")).toBeNull();
  });
});
