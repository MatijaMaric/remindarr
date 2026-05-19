/**
 * Prune source map files from frontend/dist after Sentry has ingested them.
 *
 * Usage: bun run prune:maps
 *        bun run scripts/prune-sourcemaps.ts
 *
 * Deletes all *.map files under frontend/dist/, prints the count and total
 * size freed, then exits. Skips gracefully if frontend/dist/ does not exist.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";

const DIST_DIR = path.resolve(import.meta.dir, "../frontend/dist");

function collectMapFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMapFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".map")) {
      results.push(fullPath);
    }
  }
  return results;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

if (!existsSync(DIST_DIR)) {
  console.warn(`prune-sourcemaps: frontend/dist/ not found — skipping.`);
  process.exit(0);
}

const mapFiles = collectMapFiles(DIST_DIR);

if (mapFiles.length === 0) {
  console.log("prune-sourcemaps: no .map files found — nothing to delete.");
  process.exit(0);
}

let totalBytes = 0;
for (const file of mapFiles) {
  totalBytes += statSync(file).size;
  unlinkSync(file);
}

console.log(
  `prune-sourcemaps: deleted ${mapFiles.length} .map file${mapFiles.length === 1 ? "" : "s"} (${formatBytes(totalBytes)} freed).`,
);
