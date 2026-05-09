#!/usr/bin/env bun
/**
 * Removes stale Claude Code agent worktrees from .claude/worktrees/.
 *
 * Usage:
 *   bun scripts/cleanup-worktrees.ts [--days N] [--dry-run]
 *
 * Defaults: --days 7
 * Refuses to remove worktrees with uncommitted changes.
 */

import { execSync } from "child_process"
import { readdirSync, statSync } from "fs"
import { join, resolve } from "path"

const args = process.argv.slice(2)
const daysArg = args.find((a) => a.startsWith("--days"))
const dryRun = args.includes("--dry-run")
const maxAgeDays = daysArg ? parseInt(daysArg.split("=")[1] ?? daysArg.split(" ")[1] ?? "7") : 7

const repoRoot = resolve(import.meta.dir, "..")
const worktreesDir = join(repoRoot, ".claude", "worktrees")

const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

let dirs: string[]
try {
  dirs = readdirSync(worktreesDir).filter((d) => d.startsWith("agent-"))
} catch {
  console.log("No .claude/worktrees/ directory found — nothing to clean.")
  process.exit(0)
}

const kept: string[] = []
const removed: string[] = []
const skippedDirty: string[] = []
const skippedRecent: string[] = []

for (const dir of dirs) {
  const fullPath = join(worktreesDir, dir)
  const mtime = statSync(fullPath).mtimeMs

  if (mtime >= cutoff) {
    skippedRecent.push(dir)
    continue
  }

  // Check for uncommitted changes
  let isDirty = false
  try {
    const status = execSync(`git -C "${fullPath}" status --porcelain`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    isDirty = status.length > 0
  } catch {
    // Not a git repo or git error — treat as clean
  }

  if (isDirty) {
    skippedDirty.push(dir)
    continue
  }

  if (dryRun) {
    console.log(`[dry-run] Would remove: ${fullPath}`)
    removed.push(dir)
    continue
  }

  try {
    execSync(`git worktree remove --force "${fullPath}"`, { stdio: "pipe" })
  } catch {
    try {
      execSync(`git worktree prune`, { stdio: "pipe" })
      execSync(`git worktree remove --force "${fullPath}"`, { stdio: "pipe" })
    } catch {
      // Already gone or unregistered — just rm
    }
  }

  try {
    execSync(`rm -rf "${fullPath}"`, { stdio: "pipe" })
    removed.push(dir)
  } catch (err) {
    console.error(`Failed to remove ${fullPath}:`, err)
    kept.push(dir)
  }
}

// Summary
console.log(`\n=== Worktree cleanup (--days ${maxAgeDays}${dryRun ? ", dry-run" : ""}) ===`)
if (removed.length > 0) {
  console.log(`\n✅ Removed (${removed.length}):`)
  removed.forEach((d) => console.log(`  ${d}`))
}
if (skippedDirty.length > 0) {
  console.log(`\n⚠️  Skipped — uncommitted changes (${skippedDirty.length}):`)
  skippedDirty.forEach((d) => console.log(`  ${d}`))
}
if (skippedRecent.length > 0) {
  console.log(`\n⏳ Kept — under ${maxAgeDays} days old (${skippedRecent.length}):`)
  skippedRecent.forEach((d) => console.log(`  ${d}`))
}
if (kept.length > 0) {
  console.log(`\n❌ Failed to remove (${kept.length}):`)
  kept.forEach((d) => console.log(`  ${d}`))
}

// Show remaining registered worktrees
console.log("\n--- git worktree list ---")
try {
  console.log(execSync("git worktree list", { encoding: "utf8" }))
} catch (e) {
  console.error("Could not run git worktree list:", e)
}
