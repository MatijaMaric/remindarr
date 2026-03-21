import { describe, test, expect } from "bun:test";
import { checkAdminClaim } from "./better-auth";

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
