import { describe, test, expect } from "bun:test";
import { CONFIG } from "../config";
import { snapshotConfig, restoreConfig, withConfigGuard } from "./config";

const ORIGINAL_BASE_URL = CONFIG.BASE_URL;

describe("withConfigGuard", () => {
  withConfigGuard();

  // These two tests are intentionally order-dependent: A mutates CONFIG and
  // B verifies the guard restored it between tests.
  test("A: a test can mutate CONFIG.BASE_URL", () => {
    CONFIG.BASE_URL = "https://mutated.example.com";
    expect(CONFIG.BASE_URL).toBe("https://mutated.example.com");
  });

  test("B: the mutation from A was restored by the guard", () => {
    expect(CONFIG.BASE_URL).toBe(ORIGINAL_BASE_URL);
  });
});

describe("snapshotConfig / restoreConfig", () => {
  test("round-trips a direct mutation", () => {
    const snapshot = snapshotConfig();
    const original = CONFIG.BASE_URL;

    CONFIG.BASE_URL = "https://round-trip.example.com";
    expect(CONFIG.BASE_URL).not.toBe(original);

    restoreConfig(snapshot);
    expect(CONFIG.BASE_URL).toBe(original);
  });
});
