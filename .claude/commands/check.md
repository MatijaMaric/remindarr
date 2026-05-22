Run `bun run check` (the full CI pipeline: server tsc + frontend tsc + ESLint + all tests).

If it exits zero: report "✅ All checks passed" and the runtime.

If it exits non-zero: group failures by phase. For each failing phase, quote the **first** failure with `file:line` and a one-line description. Use this grouping:

- **server-tsc**: TypeScript errors in `server/`
- **frontend-tsc**: TypeScript errors in `frontend/`
- **lint**: ESLint errors or warnings
- **tests**: failing test name + assertion message

End with a one-line summary: "N phases failed: [phase list]".

Do not attempt to fix anything — just report. The user will decide what to act on.
