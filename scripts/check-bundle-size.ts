/**
 * Bundle size gate — compares gzip sizes of build artifacts against committed budgets.
 *
 * Usage:
 *   bun run check:bundle
 *   bun run scripts/check-bundle-size.ts
 *
 * Reads budgets from scripts/bundle-budgets.json, measures gzip size of each
 * artifact, prints a formatted table, and exits 1 if any budget is exceeded.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { gzipSync } from "zlib";
import path from "path";

export interface Budgets {
  frontend_entry_gzip: number;
  frontend_css_gzip: number;
  worker_gzip: number;
}

export interface ArtifactCheck {
  label: string;
  filePath: string;
  budgetKey: keyof Budgets;
}

export interface CheckResult {
  label: string;
  filePath: string;
  actual: number;
  budget: number;
  over: boolean;
}

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const BUDGETS_FILE = path.join(import.meta.dir, "bundle-budgets.json");

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function measureGzip(filePath: string): number {
  const raw = readFileSync(filePath);
  return gzipSync(raw).length;
}

export function evaluateChecks(
  checks: Array<{ label: string; actual: number; budget: number; filePath: string }>,
): CheckResult[] {
  return checks.map(({ label, actual, budget, filePath }) => ({
    label,
    filePath,
    actual,
    budget,
    over: actual > budget,
  }));
}

export function printTable(results: CheckResult[]): void {
  const labelWidth = Math.max(...results.map((r) => r.label.length), 5);
  const fileWidth = Math.max(...results.map((r) => path.relative(REPO_ROOT, r.filePath).length), 4);
  const actualWidth = Math.max(...results.map((r) => formatBytes(r.actual).length), 6);
  const budgetWidth = Math.max(...results.map((r) => formatBytes(r.budget).length), 6);

  const header = [
    "ARTIFACT".padEnd(labelWidth),
    "FILE".padEnd(fileWidth),
    "ACTUAL".padStart(actualWidth),
    "BUDGET".padStart(budgetWidth),
    "STATUS",
  ].join("  ");

  const divider = "-".repeat(header.length);

  console.log("\n" + divider);
  console.log(header);
  console.log(divider);

  for (const r of results) {
    const status = r.over
      ? `OVER by ${formatBytes(r.actual - r.budget)}`
      : "OK";
    const line = [
      r.label.padEnd(labelWidth),
      path.relative(REPO_ROOT, r.filePath).padEnd(fileWidth),
      formatBytes(r.actual).padStart(actualWidth),
      formatBytes(r.budget).padStart(budgetWidth),
      status,
    ].join("  ");
    console.log(line);
  }

  console.log(divider + "\n");
}

function resolveEntryJs(distAssetsDir: string): string {
  const files = readdirSync(distAssetsDir).filter(
    (f) => f.startsWith("index-") && f.endsWith(".js"),
  );
  if (files.length === 0) {
    throw new Error(`No index-*.js found in ${distAssetsDir}`);
  }
  if (files.length > 1) {
    // Pick the largest one as the main entry chunk
    const sorted = files
      .map((f) => ({ f, size: readFileSync(path.join(distAssetsDir, f)).length }))
      .sort((a, b) => b.size - a.size);
    return path.join(distAssetsDir, sorted[0].f);
  }
  return path.join(distAssetsDir, files[0]);
}

function resolveEntryCss(distAssetsDir: string): string {
  const files = readdirSync(distAssetsDir).filter(
    (f) => f.startsWith("index-") && f.endsWith(".css"),
  );
  if (files.length === 0) {
    throw new Error(`No index-*.css found in ${distAssetsDir}`);
  }
  return path.join(distAssetsDir, files[0]);
}

function run(): void {
  // Load budgets
  if (!existsSync(BUDGETS_FILE)) {
    console.error(`check-bundle-size: budgets file not found: ${BUDGETS_FILE}`);
    process.exit(1);
  }
  const budgets: Budgets = JSON.parse(readFileSync(BUDGETS_FILE, "utf8")) as Budgets;

  // Resolve artifact paths
  const distAssetsDir = path.join(REPO_ROOT, "frontend", "dist", "assets");
  const workerPath = path.join(REPO_ROOT, ".wrangler", "dry-run", "worker.js");

  const missing: string[] = [];

  if (!existsSync(distAssetsDir)) {
    missing.push(
      `frontend/dist/assets/ — run "bun run build" first`,
    );
  }
  if (!existsSync(workerPath)) {
    missing.push(
      `.wrangler/dry-run/worker.js — run "bunx wrangler deploy --dry-run --outdir .wrangler/dry-run" first`,
    );
  }

  if (missing.length > 0) {
    console.error("check-bundle-size: required artifacts not found:");
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    process.exit(1);
  }

  let entryJsPath: string;
  let entryCssPath: string;

  try {
    entryJsPath = resolveEntryJs(distAssetsDir);
  } catch (err) {
    console.error(`check-bundle-size: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    entryCssPath = resolveEntryCss(distAssetsDir);
  } catch (err) {
    console.error(`check-bundle-size: ${(err as Error).message}`);
    process.exit(1);
  }

  // Measure gzip sizes
  const rawChecks = [
    {
      label: "frontend_entry_gzip",
      filePath: entryJsPath,
      actual: measureGzip(entryJsPath),
      budget: budgets.frontend_entry_gzip,
    },
    {
      label: "frontend_css_gzip",
      filePath: entryCssPath,
      actual: measureGzip(entryCssPath),
      budget: budgets.frontend_css_gzip,
    },
    {
      label: "worker_gzip",
      filePath: workerPath,
      actual: measureGzip(workerPath),
      budget: budgets.worker_gzip,
    },
  ];

  const results = evaluateChecks(rawChecks);
  printTable(results);

  const failures = results.filter((r) => r.over);
  if (failures.length > 0) {
    console.error(
      `check-bundle-size: ${failures.length} artifact${failures.length === 1 ? "" : "s"} exceeded budget:`,
    );
    for (const f of failures) {
      console.error(
        `  ${f.label}: ${formatBytes(f.actual)} > ${formatBytes(f.budget)} (over by ${formatBytes(f.actual - f.budget)})`,
      );
    }
    console.error(
      "\nTo update budgets, edit scripts/bundle-budgets.json.",
    );
    process.exit(1);
  }

  console.log(
    `check-bundle-size: all ${results.length} artifacts within budget.`,
  );
}

if (import.meta.main) {
  run();
}
