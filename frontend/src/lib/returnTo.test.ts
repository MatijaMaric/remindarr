import { describe, expect, it } from "bun:test";
import { returnTo } from "./returnTo";

describe("returnTo", () => {
  it("returns the saved path with its query", () => {
    expect(returnTo({ from: "/invite?code=abc123" })).toBe(
      "/invite?code=abc123",
    );
  });

  it("falls back to / without a saved path", () => {
    expect(returnTo(null)).toBe("/");
    expect(returnTo(undefined)).toBe("/");
    expect(returnTo({})).toBe("/");
    expect(returnTo({ from: 42 })).toBe("/");
  });

  it("rejects paths that leave the site", () => {
    expect(returnTo({ from: "https://evil.example" })).toBe("/");
    expect(returnTo({ from: "//evil.example" })).toBe("/");
    expect(returnTo({ from: "/\\evil.example" })).toBe("/");
  });
});
