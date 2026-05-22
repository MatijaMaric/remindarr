Triage the most recent unresolved Sentry issue for remindarr.

**Steps:**

1. Use `mcp__plugin_sentry_sentry__search_issues` with query `is:unresolved` sorted by `date` (most recent first). Take the top result.
2. Print the issue title, Sentry ID, first-seen date, and event count.
3. Delegate full triage to the `sentry-triager` subagent, passing the issue ID.
4. Surface the subagent's output inline: root cause, regression test, patch, and PR reference.

If no unresolved issues exist, report "✅ No unresolved Sentry issues."

If Sentry MCP is not connected (tool call fails), fall back to: ask the user to paste the Sentry issue URL, then invoke the `sentry-triager` subagent with that URL.
