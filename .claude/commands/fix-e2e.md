Fix a failing Playwright spec by diagnosing and proposing the smallest patch.

**Usage**: `/fix-e2e <spec>`

Example: `/fix-e2e calendar-feed`

Dispatch the `e2e-maintenance` subagent with this prompt:

> "Triage the failing e2e spec `<spec>.spec.ts`. Run it with `bun run test:e2e -- --project=chromium <spec>`, read the error and trace, diagnose the root cause, and propose (or apply, for non-sensitive specs) the fix. Report in the standard format. For oidc, passkey, notifications, or any auth-related spec: propose only — do not auto-apply."
