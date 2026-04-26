import { describe, test, expect } from "bun:test";
import { posterUrl, backdropUrl, profileUrl, stillUrl, logoUrl } from "./tmdb-images";

describe("posterUrl", () => {
  test("returns null for null path", () => {
    expect(posterUrl(null)).toBeNull();
  });

  test("returns null for undefined path", () => {
    expect(posterUrl(undefined)).toBeNull();
  });

  test("returns null for empty string path", () => {
    expect(posterUrl("")).toBeNull();
  });

  test("returns URL with default size w342", () => {
    expect(posterUrl("/foo.jpg")).toBe("https://image.tmdb.org/t/p/w342/foo.jpg");
  });

  test("returns URL with explicit size", () => {
    expect(posterUrl("/foo.jpg", "w500")).toBe("https://image.tmdb.org/t/p/w500/foo.jpg");
  });

  test("returns URL with w92 size", () => {
    expect(posterUrl("/bar.jpg", "w92")).toBe("https://image.tmdb.org/t/p/w92/bar.jpg");
  });

  test("returns URL with original size", () => {
    expect(posterUrl("/baz.jpg", "original")).toBe("https://image.tmdb.org/t/p/original/baz.jpg");
  });
});

describe("backdropUrl", () => {
  test("returns null for null path", () => {
    expect(backdropUrl(null)).toBeNull();
  });

  test("returns null for undefined path", () => {
    expect(backdropUrl(undefined)).toBeNull();
  });

  test("returns null for empty string path", () => {
    expect(backdropUrl("")).toBeNull();
  });

  test("returns URL with default size w1280", () => {
    expect(backdropUrl("/backdrop.jpg")).toBe("https://image.tmdb.org/t/p/w1280/backdrop.jpg");
  });

  test("returns URL with explicit size", () => {
    expect(backdropUrl("/backdrop.jpg", "w780")).toBe("https://image.tmdb.org/t/p/w780/backdrop.jpg");
  });
});

describe("profileUrl", () => {
  test("returns null for null path", () => {
    expect(profileUrl(null)).toBeNull();
  });

  test("returns null for undefined path", () => {
    expect(profileUrl(undefined)).toBeNull();
  });

  test("returns null for empty string path", () => {
    expect(profileUrl("")).toBeNull();
  });

  test("returns URL with default size w185", () => {
    expect(profileUrl("/profile.jpg")).toBe("https://image.tmdb.org/t/p/w185/profile.jpg");
  });

  test("returns URL with explicit size", () => {
    expect(profileUrl("/profile.jpg", "w45")).toBe("https://image.tmdb.org/t/p/w45/profile.jpg");
  });
});

describe("stillUrl", () => {
  test("returns null for null path", () => {
    expect(stillUrl(null)).toBeNull();
  });

  test("returns null for undefined path", () => {
    expect(stillUrl(undefined)).toBeNull();
  });

  test("returns null for empty string path", () => {
    expect(stillUrl("")).toBeNull();
  });

  test("returns URL with default size w300", () => {
    expect(stillUrl("/still.jpg")).toBe("https://image.tmdb.org/t/p/w300/still.jpg");
  });

  test("returns URL with explicit size", () => {
    expect(stillUrl("/still.jpg", "w185")).toBe("https://image.tmdb.org/t/p/w185/still.jpg");
  });
});

describe("logoUrl", () => {
  test("returns null for null path", () => {
    expect(logoUrl(null)).toBeNull();
  });

  test("returns null for undefined path", () => {
    expect(logoUrl(undefined)).toBeNull();
  });

  test("returns null for empty string path", () => {
    expect(logoUrl("")).toBeNull();
  });

  test("returns URL with default size w185", () => {
    expect(logoUrl("/logo.png")).toBe("https://image.tmdb.org/t/p/w185/logo.png");
  });

  test("returns URL with explicit size", () => {
    expect(logoUrl("/logo.png", "w500")).toBe("https://image.tmdb.org/t/p/w500/logo.png");
  });
});
