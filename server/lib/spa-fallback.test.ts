import { describe, it, expect } from "bun:test";
import { isFileLikePath } from "./spa-fallback";

describe("isFileLikePath", () => {
  it("returns true for scanner-probe file paths", () => {
    expect(isFileLikePath("/.env")).toBe(true);
    expect(isFileLikePath("/wp-login.php")).toBe(true);
    expect(isFileLikePath("/serviceAccount.json")).toBe(true);
    expect(isFileLikePath("/foo/bar.php")).toBe(true);
  });

  it("returns false for SPA routes without dots", () => {
    expect(isFileLikePath("/")).toBe(false);
    expect(isFileLikePath("/settings")).toBe(false);
  });

  it("returns false for routes where the last segment has no dot", () => {
    expect(isFileLikePath("/title/movie-123")).toBe(false);
  });

  it("returns false for username routes even when usernames contain dots", () => {
    expect(isFileLikePath("/u/john.doe")).toBe(false);
    expect(isFileLikePath("/user/john.doe")).toBe(false);
    expect(isFileLikePath("/u/alice/achievements")).toBe(false);
  });
});
