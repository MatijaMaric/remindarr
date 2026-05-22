Remove stale Claude Code agent worktrees from `.claude/worktrees/`.

**Default**: remove `agent-*` directories older than 7 days. Accept an optional age argument: `/cleanup-worktrees 14` for 14 days.

**Steps:**

1. List all directories matching `.claude/worktrees/agent-*` with their last-modified time
2. For each directory older than the threshold:
   a. Check for uncommitted changes: `git -C <path> status --porcelain`
   b. If dirty: SKIP and surface to user as "⚠️ has uncommitted changes — skipped"
   c. If clean: run `git worktree remove --force <path>` then `rm -rf <path>`
3. Report: kept (N, reasons), removed (N, paths), skipped-dirty (paths)

**Safety**: never remove a worktree without checking for uncommitted changes first. If `git worktree remove` fails (e.g., branch still registered), fall back to `git worktree prune` then retry.

After cleanup, run `git worktree list` and include the output so the user can see the remaining registered worktrees.
