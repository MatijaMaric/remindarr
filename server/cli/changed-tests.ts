import { existsSync } from "node:fs";
import { join } from "node:path";

export function mapChangedFilesToTests(
  files: string[],
  exists: (p: string) => boolean,
): { server: string[]; frontend: string[] } {
  const server = new Set<string>();
  const frontend = new Set<string>();

  for (const file of files) {
    let candidate: string | null = null;

    if (/\.test\.tsx?$/.test(file)) {
      candidate = file;
    } else if (file.endsWith(".tsx")) {
      candidate = file.replace(/\.tsx$/, ".test.tsx");
    } else if (file.endsWith(".ts")) {
      candidate = file.replace(/\.ts$/, ".test.ts");
    }
    // Non-ts files (.css, .json, .md, .yml, etc.) — ignored; CI covers broad impact

    if (!candidate || !exists(candidate)) continue;

    if (candidate.startsWith("server/")) {
      server.add(candidate);
    } else if (candidate.startsWith("frontend/")) {
      // Frontend tests run with cwd=frontend/, so strip the prefix
      frontend.add(candidate.slice("frontend/".length));
    }
    // e2e/, evals/, root files → ignored (check doesn't run those either)
  }

  return { server: [...server], frontend: [...frontend] };
}

function git(args: string[]): { ok: boolean; out: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: proc.exitCode === 0,
    out: new TextDecoder().decode(proc.stdout).trim(),
  };
}

function resolveBaseRef(): string | null {
  for (const ref of ["origin/master", "master"]) {
    if (git(["rev-parse", "--verify", ref]).ok) return ref;
  }
  return null;
}

function runBunTest(paths: string[], cwd: string): boolean {
  const proc = Bun.spawnSync(["bun", "test", ...paths], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  return proc.exitCode === 0;
}

if (import.meta.main) {
  const repoRoot = process.cwd();
  const baseRef = resolveBaseRef();

  if (!baseRef) {
    console.log(
      "⚠️  No origin/master found — running full test suite as fallback.",
    );
    const ok =
      runBunTest(["server/"], repoRoot) &&
      runBunTest(["src/"], join(repoRoot, "frontend"));
    process.exit(ok ? 0 : 1);
  }

  const { out } = git([
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    `${baseRef}...HEAD`,
  ]);
  const changedFiles = out.split("\n").filter(Boolean);

  const { server, frontend } = mapChangedFilesToTests(changedFiles, (p) =>
    existsSync(join(repoRoot, p)),
  );

  if (server.length === 0 && frontend.length === 0) {
    console.log("✅ No changed test files — full suite still runs in CI.");
    process.exit(0);
  }

  let passed = true;

  if (server.length > 0) {
    console.log(`🔍 Running ${server.length} server test file(s)…`);
    if (!runBunTest(server, repoRoot)) passed = false;
  }

  if (frontend.length > 0) {
    console.log(`🔍 Running ${frontend.length} frontend test file(s)…`);
    if (!runBunTest(frontend, join(repoRoot, "frontend"))) passed = false;
  }

  process.exit(passed ? 0 : 1);
}
