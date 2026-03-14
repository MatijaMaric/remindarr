# Full Solution Review — Remindarr

**Date:** 2026-03-14
**Scope:** 75 files changed, ~5,700 lines added across 53 merged PRs
**CI Status:** All 348 tests pass, type checking clean

---

## Executive Summary

Remindarr is a well-structured full-stack app for tracking streaming media releases. The codebase follows good conventions: TypeScript strict mode, colocated tests, structured logging, and clear separation of concerns. However, the review uncovered several issues ranging from a **critical security finding** (admin password logged in plaintext) to missing input validation, test coverage gaps, and some React state management bugs.

---

## 1. CRITICAL — Security

### 1.1 Admin password logged in plaintext
**File:** `server/index.ts:42`
```typescript
logger.info("Admin account created", { username: "admin", password });
```
The auto-generated admin password is written to structured logs. If logs are shipped to any external service (which they likely are given the Sentry integration), this is a credentials leak.

**Fix:** Log only that the account was created. Print the password to stdout once, or require the user to set it via env var.

### 1.2 Unrestricted CORS
**File:** `server/index.ts:58`
```typescript
app.use("/api/*", cors());
```
CORS is wide open with no origin restriction. Any website can make authenticated cross-origin requests to the API if credentials are included.

**Fix:** Restrict to the app's own origin, or at minimum the Vite dev server origin in development.

---

## 2. HIGH — Input Validation & Error Handling

### 2.1 No validation on numeric query parameters
**Files:** `server/routes/titles.ts:9-16`, `server/routes/browse.ts:99`

`daysBack`, `limit`, `offset`, and `page` are parsed from query strings with no bounds checking. Negative values, NaN, or extremely large numbers pass through to DB queries.

**Fix:** Clamp to valid ranges:
```typescript
const limit = Math.max(1, Math.min(Number(q) || 100, 1000));
```

### 2.2 Missing JSON.parse error handling in notifier config
**File:** `server/db/repository.ts:1201, 1231, 1269`

`JSON.parse(row.config)` on notifier rows has no try-catch. Corrupted data crashes the request.

### 2.3 OIDC user creation race condition
**File:** `server/routes/auth.ts:184-190`

TOCTOU between `getUserByUsername()` check and `createUser()`. Concurrent OIDC logins with the same username could hit the UNIQUE constraint and return an unhandled error.

### 2.4 Silent error swallowing in sync route
**File:** `server/routes/sync.ts:8`
```typescript
const body = await c.req.json().catch(() => ({}));
```
Malformed JSON silently becomes `{}` — should return 400.

### 2.5 No timeout on TMDB API calls
**File:** `server/tmdb/client.ts`

All `fetch()` calls to TMDB have no timeout. A slow/hung upstream will block the server indefinitely.

**Fix:** Add `AbortController` with a 10-15s timeout.

---

## 3. MEDIUM — Code Quality

### 3.1 N+1 query pattern
**File:** `server/db/repository.ts:287-293`

`getRecentTitles()` calls `getOffersForTitle()` per row, producing N+1 queries. Should batch-fetch offers in a single query and group in memory.

### 3.2 React state update bugs in HomePage
**File:** `frontend/src/pages/HomePage.tsx:522-524`

The `updateAll` helper is passed directly to `setState`:
```typescript
setToday(updateAll);
setUpcoming(updateAll);
```
If `updateAll` is not designed as a functional updater (taking previous state, returning new state), this silently fails. Verify it matches `(prev: T[]) => T[]` signature.

### 3.3 Stale closure in ReelsPage
**File:** `frontend/src/pages/ReelsPage.tsx:140`

`markWatched` captures `cards` in its closure. Rapid user interactions could use a stale reference. Use a ref or functional state update.

### 3.4 Missing error UI in CategoryBrowse
**File:** `frontend/src/components/CategoryBrowse.tsx:101-143`

Error state is set but never displayed to the user. Pagination failures are invisible.

### 3.5 Meaningless test assertion
**File:** `server/db/repository.test.ts:573`
```typescript
expect(true).toBe(true); // "Verify no duplicate"
```
This asserts nothing. Should query the DB and verify the count.

### 3.6 Promise.all with no error handling
**File:** `frontend/src/components/NewReleases.tsx:47-55`

`Promise.all([getGenres(), getProviders(), getLanguages()])` has no `.catch()`. If any of these fail, the filter dropdowns silently don't populate.

---

## 4. LOW — Best Practices

### 4.1 No rate limiting
No rate limiting on any endpoints. `/api/search` proxies to TMDB and could be abused to exhaust API quotas.

### 4.2 Array index keys in React
**File:** `frontend/src/pages/TitleDetailPage.tsx:283, 353`

Using `key={i}` instead of stable keys (`key={genre}`, `key={releaseDate.type}`). Can cause subtle re-render bugs.

### 4.3 OIDC state store is in-memory
**File:** `server/auth/oidc.ts:36-47`

State tokens are stored in a `Map` with 10-minute TTL. Works fine for single-instance, but will break if the app is ever load-balanced.

### 4.4 Missing ARIA attributes
**File:** `frontend/src/components/FilterBar.tsx:162-172`

"Hide Tracked" toggle button has no `aria-pressed` attribute for screen reader users.

### 4.5 `any` types in API client
**File:** `frontend/src/api.ts:196, 200`

`getAdminSettings()` and `updateAdminSettings()` return `any`. Should have proper interfaces.

---

## 5. Test Coverage Assessment

### CI Status
- **348 tests pass** across 35 test files
- **Type checking** passes for both server and frontend
- Frontend tests required `cd frontend && bun install` to resolve `react/jsx-dev-runtime`

### Coverage Gaps

**Server — untested routes (6 critical):**
| Route | Risk |
|-------|------|
| `POST /api/sync` | HIGH — triggers full data sync |
| `GET/PUT /api/admin/settings` | HIGH — OIDC config management |
| `POST/PUT/DELETE /api/notifiers` | HIGH — notification system |
| `POST /api/episodes` | MEDIUM — episode watch state |
| `POST /api/imdb` | MEDIUM — IMDB resolution |
| `GET /api/calendar` | MEDIUM — calendar view |

**Server — untested modules:**
- `server/tmdb/client.ts` — 200+ lines, the core TMDB integration, zero tests
- `server/auth/oidc.ts` — OpenID Connect flow, zero tests
- `server/middleware/auth.ts` — session validation
- `server/notifications/discord.ts` — Discord webhook delivery
- `server/jobs/queue.ts` has tests but `server/jobs/sync.ts` does not

**Frontend — nearly all components untested:**
- 18+ React components/pages have no rendering tests
- Existing frontend tests only validate logic/types, not component behavior
- No integration tests for multi-component flows (search → detail → track)

### Test Quality Issues
- `repository.test.ts:573` — `expect(true).toBe(true)` is a no-op assertion
- Date-based tests use `new Date()` instead of fixed dates — may flake at midnight UTC
- Missing edge case tests: empty strings, negative numbers, unicode, SQL injection patterns
- No concurrent access tests for track/untrack, episode watch state

---

## 6. Architecture Observations

**Good:**
- Clean Hono route separation with middleware composition
- Structured logging throughout (logger.ts child loggers)
- Sentry integration for both server and frontend
- SQLite WAL mode for concurrent reads
- Drizzle ORM for type-safe queries
- Colocated test files following project convention

**Areas for improvement:**
- `server/db/repository.ts` is 1,797 lines — consider splitting by domain (titles, episodes, notifiers, users)
- The browse routes duplicate some logic from the titles routes — could share query builders
- No database migration tool — schema changes are applied ad-hoc in `schema.ts`

---

## Recommended Priority Actions

1. **Remove admin password from logs** (security, 5 min fix)
2. **Restrict CORS origins** (security, 5 min fix)
3. **Add input validation on query parameters** (high, 30 min)
4. **Add fetch timeouts for TMDB calls** (high, 15 min)
5. **Fix N+1 query in getRecentTitles** (medium, 30 min)
6. **Add tests for untested routes** (sync, admin, notifiers, IMDB, episodes, calendar)
7. **Add tests for tmdb/client.ts** — most critical untested module
8. **Wrap JSON.parse calls in try-catch** for notifier configs
9. **Split repository.ts** into domain-specific modules
10. **Add rate limiting** on search/sync endpoints
