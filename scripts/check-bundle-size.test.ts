import { describe, expect, test } from "bun:test";
import { evaluateChecks, formatBytes, type Budgets, type CheckResult } from "./check-bundle-size";

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  test("formats bytes under 1 KiB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  test("formats KiB values", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(22671)).toBe("22.1 KiB");
    expect(formatBytes(30000)).toBe("29.3 KiB");
  });

  test("formats MiB values", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.00 MiB");
    expect(formatBytes(1421178)).toBe("1.36 MiB");
  });
});

// ---------------------------------------------------------------------------
// evaluateChecks — core comparison logic
// ---------------------------------------------------------------------------

const budgets: Budgets = {
  frontend_entry_gzip: 30000,
  frontend_css_gzip: 30000,
  worker_gzip: 1600000,
};

describe("evaluateChecks — all within budget", () => {
  test("marks all results as not over when actual < budget", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index-abc.js", actual: 22671, budget: budgets.frontend_entry_gzip },
      { label: "frontend_css_gzip", filePath: "/fake/index-abc.css", actual: 22851, budget: budgets.frontend_css_gzip },
      { label: "worker_gzip", filePath: "/fake/worker.js", actual: 1421178, budget: budgets.worker_gzip },
    ];

    const results = evaluateChecks(input);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.over).toBe(false);
    }
  });

  test("marks a result as not over when actual === budget (boundary)", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index.js", actual: 30000, budget: 30000 },
    ];
    const results = evaluateChecks(input);
    expect(results[0].over).toBe(false);
  });
});

describe("evaluateChecks — over budget", () => {
  test("marks result as over when actual > budget", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index.js", actual: 30001, budget: 30000 },
    ];
    const results = evaluateChecks(input);
    expect(results[0].over).toBe(true);
  });

  test("marks only the failing artifact when others are within budget", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index.js", actual: 50000, budget: 30000 },
      { label: "frontend_css_gzip", filePath: "/fake/index.css", actual: 10000, budget: 30000 },
      { label: "worker_gzip", filePath: "/fake/worker.js", actual: 1000000, budget: 1600000 },
    ];

    const results = evaluateChecks(input);
    const failures = results.filter((r) => r.over);

    expect(failures).toHaveLength(1);
    expect(failures[0].label).toBe("frontend_entry_gzip");
  });

  test("marks multiple over-budget artifacts", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index.js", actual: 40000, budget: 30000 },
      { label: "frontend_css_gzip", filePath: "/fake/index.css", actual: 35000, budget: 30000 },
      { label: "worker_gzip", filePath: "/fake/worker.js", actual: 2000000, budget: 1600000 },
    ];

    const results = evaluateChecks(input);
    const failures = results.filter((r) => r.over);

    expect(failures).toHaveLength(3);
  });
});

describe("evaluateChecks — output shape", () => {
  test("preserves label, filePath, actual and budget in each result", () => {
    const input = [
      { label: "worker_gzip", filePath: "/fake/worker.js", actual: 1421178, budget: 1600000 },
    ];
    const results: CheckResult[] = evaluateChecks(input);

    expect(results[0].label).toBe("worker_gzip");
    expect(results[0].filePath).toBe("/fake/worker.js");
    expect(results[0].actual).toBe(1421178);
    expect(results[0].budget).toBe(1600000);
    expect(results[0].over).toBe(false);
  });

  test("returns empty array for empty input", () => {
    expect(evaluateChecks([])).toEqual([]);
  });
});

describe("evaluateChecks — delta accuracy", () => {
  test("actual and budget values allow callers to compute delta", () => {
    const input = [
      { label: "frontend_entry_gzip", filePath: "/fake/index.js", actual: 35000, budget: 30000 },
    ];
    const results = evaluateChecks(input);
    const delta = results[0].actual - results[0].budget;
    expect(delta).toBe(5000);
    expect(formatBytes(delta)).toBe("4.9 KiB");
  });
});
