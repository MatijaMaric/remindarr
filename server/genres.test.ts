import { describe, it, expect } from "bun:test";
import { toCanonicalGenre, expandGenreGroup, expandGenreIds } from "./genres";

describe("toCanonicalGenre", () => {
  it("maps 'Action' to 'Action & Adventure'", () => {
    expect(toCanonicalGenre("Action")).toBe("Action & Adventure");
  });

  it("maps 'Adventure' to 'Action & Adventure'", () => {
    expect(toCanonicalGenre("Adventure")).toBe("Action & Adventure");
  });

  it("maps 'Action & Adventure' to itself", () => {
    expect(toCanonicalGenre("Action & Adventure")).toBe("Action & Adventure");
  });

  it("maps 'Science Fiction' to 'Sci-Fi & Fantasy'", () => {
    expect(toCanonicalGenre("Science Fiction")).toBe("Sci-Fi & Fantasy");
  });

  it("maps 'Fantasy' to 'Sci-Fi & Fantasy'", () => {
    expect(toCanonicalGenre("Fantasy")).toBe("Sci-Fi & Fantasy");
  });

  it("maps 'War' to 'War & Politics'", () => {
    expect(toCanonicalGenre("War")).toBe("War & Politics");
  });

  it("returns non-grouped genres unchanged", () => {
    expect(toCanonicalGenre("Drama")).toBe("Drama");
    expect(toCanonicalGenre("Comedy")).toBe("Comedy");
    expect(toCanonicalGenre("Horror")).toBe("Horror");
  });
});

describe("expandGenreGroup", () => {
  it("expands 'Action & Adventure' to all members", () => {
    expect(expandGenreGroup("Action & Adventure")).toEqual(["Action", "Adventure", "Action & Adventure"]);
  });

  it("expands 'Sci-Fi & Fantasy' to all members", () => {
    expect(expandGenreGroup("Sci-Fi & Fantasy")).toEqual(["Science Fiction", "Fantasy", "Sci-Fi & Fantasy"]);
  });

  it("expands 'War & Politics' to all members", () => {
    expect(expandGenreGroup("War & Politics")).toEqual(["War", "War & Politics"]);
  });

  it("returns non-grouped genre as single-element array", () => {
    expect(expandGenreGroup("Drama")).toEqual(["Drama"]);
  });
});

describe("expandGenreIds", () => {
  const movieGenres = new Map([
    [28, "Action"],
    [12, "Adventure"],
    [878, "Science Fiction"],
    [14, "Fantasy"],
    [10752, "War"],
    [18, "Drama"],
  ]);
  const tvGenres = new Map([
    [10759, "Action & Adventure"],
    [10765, "Sci-Fi & Fantasy"],
    [10768, "War & Politics"],
    [18, "Drama"],
  ]);

  it("expands 'Action & Adventure' to movie Action, Adventure and TV Action & Adventure IDs", () => {
    const ids = expandGenreIds("Action & Adventure", movieGenres, tvGenres);
    expect(ids.sort()).toEqual([12, 28, 10759].sort());
  });

  it("expands 'Sci-Fi & Fantasy' to movie Science Fiction, Fantasy and TV Sci-Fi & Fantasy IDs", () => {
    const ids = expandGenreIds("Sci-Fi & Fantasy", movieGenres, tvGenres);
    expect(ids.sort()).toEqual([14, 878, 10765].sort());
  });

  it("expands 'War & Politics' to movie War and TV War & Politics IDs", () => {
    const ids = expandGenreIds("War & Politics", movieGenres, tvGenres);
    expect(ids.sort()).toEqual([10752, 10768].sort());
  });

  it("returns single ID for non-grouped genre present in both maps", () => {
    const ids = expandGenreIds("Drama", movieGenres, tvGenres);
    // Drama has ID 18 in both maps
    expect(ids).toEqual([18, 18]);
  });

  it("returns empty array for unknown genre", () => {
    const ids = expandGenreIds("Nonexistent", movieGenres, tvGenres);
    expect(ids).toEqual([]);
  });
});
