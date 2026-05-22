# E2E guidance

## Setup

Playwright config: `playwright.config.ts` (root). Three browser projects: chromium, firefox, webkit. CI currently runs chromium-only.

**Global setup** (`e2e/fixtures/global-setup.ts`): wipes the E2E database, starts a mock OIDC server (`mock-oidc.ts`), starts a mock webhook server (`mock-webhook.ts`), and spins up the Bun server on a dedicated port. Global teardown (`global-teardown.ts`) shuts everything down.

**Base URL**: `localhost:5173` (Vite dev server proxies `/api` to `:3000`).

**Retries**: 0 (no automatic retry on CI — failures are real).

**Traces**: `on-first-retry` — recorded on the first retry of a failing test and uploaded as artifacts on CI failure.

## Fixtures (`e2e/fixtures/`)

| File                 | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `auth.ts`            | Playwright fixtures for logged-in user sessions      |
| `constants.ts`       | Shared constants (URLs, credentials, timeouts)       |
| `global-setup.ts`    | DB wipe, mock servers, app start                     |
| `global-teardown.ts` | Clean shutdown                                       |
| `mock-oidc.ts`       | In-process OIDC provider mock (avoids real IdP)      |
| `mock-webhook.ts`    | In-process webhook receiver for notification testing |

Helpers shared across specs: `e2e/helpers.ts`.

## Spec files

| Spec                    | Status     | Notes                  |
| ----------------------- | ---------- | ---------------------- |
| `auth.spec.ts`          | CI-skipped | Deemed flaky/redundant |
| `calendar-feed.spec.ts` | CI-enabled |                        |
| `episodes.spec.ts`      | CI-skipped | Deemed flaky/redundant |
| `notifications.spec.ts` | CI-enabled | Uses mock-webhook      |
| `oidc.spec.ts`          | CI-enabled | Uses mock-oidc         |
| `passkey.spec.ts`       | CI-enabled |                        |
| `search.spec.ts`        | CI-skipped | Deemed flaky/redundant |
| `tracking.spec.ts`      | CI-skipped | Deemed flaky/redundant |

## Running locally

```bash
bun run test:e2e                        # All specs, all configured browsers
bun run test:e2e -- --project=chromium  # Chromium only (matches CI)
bun run test:e2e -- notifications       # Single spec
```

When adding a new e2e spec: start from a logged-in fixture from `e2e/fixtures/auth.ts`. Use `mock-webhook.ts` for notification assertions rather than calling real external services.

If a spec is skipped in CI (`e2e.yml`): either fix and re-enable, or open a GitHub issue and link from this file. Do not leave silent skips.
