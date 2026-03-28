import { describe, test, expect } from "bun:test";
import { checkAdminClaim, buildPasskeyOrigins, getPasskeyRpId } from "./better-auth";

describe("checkAdminClaim", () => {
  test("returns false when claimName is empty", () => {
    expect(checkAdminClaim({ role: "admin" }, "", "admin")).toBe(false);
  });

  test("returns false when claimValue is empty", () => {
    expect(checkAdminClaim({ role: "admin" }, "role", "")).toBe(false);
  });

  test("returns false when claim is missing", () => {
    expect(checkAdminClaim({}, "role", "admin")).toBe(false);
  });

  test("returns false when claim is null", () => {
    expect(checkAdminClaim({ role: null }, "role", "admin")).toBe(false);
  });

  test("returns true when scalar claim matches", () => {
    expect(checkAdminClaim({ role: "admin" }, "role", "admin")).toBe(true);
  });

  test("returns false when scalar claim does not match", () => {
    expect(checkAdminClaim({ role: "user" }, "role", "admin")).toBe(false);
  });

  test("coerces non-string scalar to string for comparison", () => {
    expect(checkAdminClaim({ level: 1 }, "level", "1")).toBe(true);
  });

  test("returns true when array claim contains the value", () => {
    expect(checkAdminClaim({ groups: ["admins", "users"] }, "groups", "admins")).toBe(true);
  });

  test("returns false when array claim does not contain the value", () => {
    expect(checkAdminClaim({ groups: ["users"] }, "groups", "admins")).toBe(false);
  });

  test("coerces array elements to string for comparison", () => {
    expect(checkAdminClaim({ flags: [1, 2, 3] }, "flags", "2")).toBe(true);
  });
});

describe("getPasskeyRpId", () => {
  test("strips www. prefix from hostname", () => {
    expect(getPasskeyRpId("https://www.remindarr.app")).toBe("remindarr.app");
  });

  test("returns bare hostname as-is", () => {
    expect(getPasskeyRpId("https://remindarr.app")).toBe("remindarr.app");
  });

  test("returns undefined for empty string", () => {
    expect(getPasskeyRpId("")).toBeUndefined();
  });

  test("returns undefined for invalid URL", () => {
    expect(getPasskeyRpId("not-a-url")).toBeUndefined();
  });

  test("preserves subdomain that is not www", () => {
    expect(getPasskeyRpId("https://app.remindarr.app")).toBe("app.remindarr.app");
  });

  test("returns localhost for localhost URL", () => {
    expect(getPasskeyRpId("http://localhost:3000")).toBe("localhost");
  });
});

describe("buildPasskeyOrigins", () => {
  test("returns both non-www and www variants for a non-www URL", () => {
    expect(buildPasskeyOrigins("https://remindarr.app")).toEqual([
      "https://remindarr.app",
      "https://www.remindarr.app",
    ]);
  });

  test("returns both www and non-www variants for a www URL", () => {
    expect(buildPasskeyOrigins("https://www.remindarr.app")).toEqual([
      "https://www.remindarr.app",
      "https://remindarr.app",
    ]);
  });

  test("strips trailing slash", () => {
    expect(buildPasskeyOrigins("https://remindarr.app/")).toEqual([
      "https://remindarr.app",
      "https://www.remindarr.app",
    ]);
  });

  test("returns empty array for empty string", () => {
    expect(buildPasskeyOrigins("")).toEqual([]);
  });

  test("returns single-element array for invalid URL", () => {
    expect(buildPasskeyOrigins("not-a-url")).toEqual(["not-a-url"]);
  });

  test("preserves port in origins", () => {
    expect(buildPasskeyOrigins("http://localhost:3000")).toEqual([
      "http://localhost:3000",
      "http://www.localhost:3000",
    ]);
  });
});
