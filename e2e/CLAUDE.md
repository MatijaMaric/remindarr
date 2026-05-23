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

## Page Object Model

New specs should use Page Objects rather than raw locators inline. Page objects live in `e2e/pages/`.

| File            | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `base-page.ts`  | `BasePage` abstract class — `goto(path)`, `waitForVisible(locator)` |
| `login-page.ts` | `LoginPage` — reference implementation; handles OIDC/passkey toggle |

**Conventions:**

- Extend `BasePage` — no constructor needed (inherits `protected readonly page: Page`)
- One class per logical page/section; split into multiple files if a feature spans distinct pages
- Navigation method: `gotoFeature(): Promise<void>` calling `await this.goto('/path')`
- **Semantic locators only**: `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`. Never `locator('#id')` or `locator('.class')` unless there is truly no semantic alternative
- Add JSDoc on any method that handles non-DOM knowledge (clipboard-only tokens, permission rules, timing constraints)

Existing specs (`auth`, `episodes`, `search`, `tracking`) use the older helper-function style and are not being migrated. Use Page Objects for all new specs.

## Context document

`e2e/app.context.md` captures product knowledge that is NOT derivable from the DOM or the
source code alone — user roles, auth modes, non-DOM secrets, flow ordering constraints, the
mock-vs-real backend split, and per-feature notes for test authoring.

The `e2e-explorer` agent owns this file and updates it before each `/gen-e2e` run.
Do not duplicate information from the scoped `CLAUDE.md` files — link to them instead.

## Test-case documents

`e2e/test-cases/<feature>.md` holds the human-reviewed test-case spec for a feature before
any automation code is written. These are the **human checkpoint** in the generation pipeline.
They are committed alongside specs and serve as living documentation.

## Generation workflow

Two slash commands drive the pipeline:

```bash
/gen-e2e <feature>   # Exploration → test-case authoring → HUMAN APPROVAL → automation
/fix-e2e <spec>      # Run failing spec → diagnose → propose (or apply) fix
```

**Generated specs start local-only.** After `/gen-e2e` produces a spec, it is NOT
automatically added to CI. Once the spec is proven stable on your machine, update the spec
list in `.github/workflows/e2e.yml` manually — this is an intentional human decision.
