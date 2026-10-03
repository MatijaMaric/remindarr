# Review #1218 implementation and evidence

Review date: 2026-10-03. Initial baseline: `089e845`; integrated master `6ce29d3`.
Tests use isolated synthetic accounts,
databases, an RSA-signing test IdP and loopback HTTP receivers. No production
accounts, notification destinations or Plex libraries are used.

## Implemented follow-ups

| Issue                | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1153                | Shared outbound policy for webhook, ntfy, Gotify, Discord, Telegram, Web Push and Plex. Exact operator allowlists, public DNS checks, private-service exceptions, redirect rejection, 10-second deadline, 8 MiB cap and sanitized errors. `server/lib/outbound.test.ts` and delivery integration tests exercise these boundaries. See [operator configuration](configuration.md#outbound-integration-destinations), including the DNS preflight limitation.          |
| #1156                | Better Auth and passkey plugin pinned together to 1.7.7. Implicit email-based account linking is disabled. Signed issuer/audience/nonce callback tests reject a verified IdP login colliding with an unverified password account. Existing linked identities still sign in. Local signup/password and virtual passkey ceremonies pass. The old `/api/auth/oauth2/callback/pocketid` URI remains compatible; new registrations can use `/api/auth/callback/pocketid`. |
| #1160                | Updated root/workspace lockfile and compatible dependencies; audit details below. Prettier 3.8.3 and React Hooks lint plugin 7.0.1 remain pinned to preserve existing formatting/rule behavior.                                                                                                                                                                                                                                                                      |
| #1186                | Account-scoped IndexedDB watchlist intent, explicit queued feedback, last desired state per title, session-verified replay and server-side account mismatch rejection. Production service-worker test closes and restarts the browser offline, then verifies persisted server state after reconnect.                                                                                                                                                                 |
| #1187                | Bounded offline session and cached library/calendar bootstrap. Cold offline navigation, reconnect and expired-session denial are covered by the production browser suite. Logout/account changes retain the existing identity fences and clear the new store.                                                                                                                                                                                                        |
| #1217                | `bun run test:e2e:core` runs signup, real catalogue API/search, track, watch, library and the actual Stats entry point against the production app/server. Only external TMDB responses are controlled. PR, merge queue and master CI run it with failure traces/screenshots.                                                                                                                                                                                         |
| #379 review addendum | All six existing locales include new recovery, export-scope and offline strings. Language setting copy distinguishes interface language, metadata/search configuration and date formatting. This does not claim that every legacy server notification is translated.                                                                                                                                                                                                 |
| #461 review addendum | Local sign-in exposes recovery guidance explaining the current administrator-assisted route and existing passkey/SSO alternatives. An SMTP/token-reset system is not introduced by this review follow-up.                                                                                                                                                                                                                                                            |
| #540 review addendum | Export copy identifies supported fields and exclusions. A real export/import/export regression preserves notes and movie watched state in another account while coalescing duplicates and skipping malformed rows. Existing tests cover watched episode restoration, size limits and shared catalogue isolation. Full account export/deletion remains the broader feature request.                                                                                   |

## Validation scope and remaining manual work

- Final merged `bun run check` passed: 2,596 server tests, 1,394 frontend tests,
  one toolchain test, formatting, TypeScript, lint, production build, Wrangler
  dry run and all bundle limits. Frozen installation passed.
- Chromium, Firefox and WebKit each passed all six production journeys. OIDC and
  virtual-passkey login passed all three Chromium checks against the real auth
  backend. The test fixture trusts forwarded synthetic client addresses only
  from loopback, so unrelated test journeys do not share rate-limit buckets.
- WebKit startup stalled when the notification prompt queried the native push
  subscription before notification permission was granted. The shared lookup
  now requires granted permission; real-module tests cover default, denied and
  granted states. WebKit's separate
  [offline-emulation navigation bug](https://github.com/microsoft/playwright/issues/42775)
  is handled in the test fixture with a controlled TCP origin outage for cached
  navigation. The fixture severs existing and new connections, verifies that a
  health request fails, and requires the navigation response to come from the
  production service worker. Chromium and Firefox retain browser offline
  emulation. All browsers verify durable replay and denial of previously cached
  private content after session expiry; no projects or cases are skipped.
  Startup pageshow/focus revalidation also preserves the saved revision for the
  same account, preventing durable pending writes from being discarded before
  replay. A regression test reproduces the race and verifies that changing
  accounts still invalidates the revision.
  The follow-up frontend suite passes 1,399 tests.
- Production browser checks: core journey, durable offline browser restart,
  expired-session denial, recovery/export guidance at 200% CSS text size and a
  500-title library at 390px width. Timing is attached as `watchlist-render.json`.
  CSS text scaling is not native browser zoom or OS text scaling.
- OIDC and Chromium virtual-authenticator registration/login run against the
  real auth backend. Callback error/state/expired-token tests use the signed
  controlled IdP. Physical authenticators and native cancellation dialogs still
  need hands-on verification.
- `delivery.integration.test.ts` exercises the Bun scheduler and the portable
  Workers dispatch implementation with actual HTTP reception, daily/weekly/off
  modes, a 503 outage, recovery and no repeat delivery after success. The
  content source and clock are controlled. Existing timezone and retry tests
  run in the full server suite. This is not a deployed Cloudflare/D1 delivery
  certification.
- A controlled Plex HTTP receiver verifies invalid-token and unavailable-service
  errors followed by successful recovery. Real Plex connect/disconnect against
  a disposable external account/library remains manual.
- #1172 still needs physical phone safe-area measurements, OS/native zoom,
  screen-reader navigation and native device testing. Fixed navigation already
  uses the safe-area inset; this change also moves the offline banner above it.
- #1173 still needs a real network interruption outside Playwright emulation,
  deployed runtime delivery and the external-device/service checks above.
  Browser offline emulation and the controlled WebKit TCP outage are not
  physical-network certification. Do not close those validation issues based
  only on this suite.

## Dependency audit

`bun audit --json` from the original frozen install reported 39 package entries
and 144 distinct advisory URLs. The updated lockfile reports six entries and
eight distinct advisories (five high, two moderate, one low). These counts are
audit findings, not confirmed application exploits.

| Package              | Dependency path and reachability                                                                                                  | Reason retained                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `basic-ftp` 5.3.1    | Lighthouse CI → proxy-agent → get-uri; FTP directory parser in a development tool. No application integration uses FTP.           | Parent requires 5.x; no compatible fix for the reported `<=6.2.0` advisory.                                   |
| `braces` 3.0.3       | shadcn → fast-glob → micromatch; development-time patterns.                                                                       | Current compatible release remains affected; untrusted glob patterns should not be supplied to the generator. |
| `esbuild` 0.18.20    | drizzle-kit → deprecated esbuild-kit loader. Advisory concerns its development server. Production bundles do not run this server. | Transitive loader pins 0.18; overriding its major/minor contract needs a separate tool migration.             |
| `extract-zip` 2.0.1  | Lighthouse → Puppeteer browser installer. Two archive/symlink traversal advisories.                                               | Parent still resolves the affected latest compatible version; only trusted browser archives are used.         |
| `tmp` 0.1.0 / 0.0.33 | Lighthouse CI and its external-editor/inquirer chain; development temporary files.                                                | Upstream parent pins old branches. A forced cross-major override was not used.                                |
| `uuid` 8.3.2         | Lighthouse CI. Advisory requires selected UUID algorithms with caller-supplied buffers.                                           | Application UUIDs use `crypto.randomUUID()`; CI parent pins 8.x.                                              |

The auth upgrade addresses the maintainer's
[conditional pre-account linking advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7).
No unused-provider-plugin or guarded static-path finding is represented here as
a demonstrated exploit.

## Reproduction and bundle budget

```sh
bun install --frozen-lockfile
bun audit --json
bun run check
bunx playwright install chromium firefox webkit
bun run test:e2e:core
bunx playwright test e2e/oidc.spec.ts e2e/passkey.spec.ts --project=chromium --workers=1 --reporter=list
```

The new offline store/UI and dependency upgrades produce approximately 32 KiB
gzip for the frontend entry and 1.62 MiB gzip for the Worker. Explicit budgets
are now 34,000 and 1,750,000 bytes respectively; the CSS budget remains 30,000.
Local Worker validation used Wrangler's dry run. No deployment command was run
manually. The repository's Cloudflare Git integration subsequently reported an
automatic deployment of PR commit `7cd285fe`; that report is not evidence of
deployed delivery or real-service validation.
