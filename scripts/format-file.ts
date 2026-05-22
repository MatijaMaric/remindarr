#!/usr/bin/env bun
// PostToolUse hook: formats the file Claude just wrote/edited with Prettier.
// Always exits 0 — a format failure must never block an edit.
const raw = await Bun.stdin.text();
let filePath: string | undefined;
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!filePath) process.exit(0);
try {
  await Bun.spawn(
    ["bunx", "prettier", "--write", "--ignore-unknown", filePath],
    { stdout: "inherit", stderr: "inherit" },
  ).exited;
} catch {
  // swallow — formatting must never block an edit
}
process.exit(0);
