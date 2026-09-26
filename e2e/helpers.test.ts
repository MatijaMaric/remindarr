import { describe, expect, it } from "bun:test";
import { isAuthGetSession } from "./helpers";

describe("isAuthGetSession", () => {
  it("matches the session URL AuthContext sends, including the cache-bypass query", () => {
    const url = new URL(
      "http://localhost:5173/api/auth/get-session?disableCookieCache=true",
    );
    expect(isAuthGetSession(url)).toBe(true);
  });

  it("matches a session URL without a query string", () => {
    expect(
      isAuthGetSession(new URL("http://localhost:5173/api/auth/get-session")),
    ).toBe(true);
  });

  it("does not match other auth routes", () => {
    expect(
      isAuthGetSession(
        new URL("http://localhost:5173/api/auth/custom/providers"),
      ),
    ).toBe(false);
  });
});
