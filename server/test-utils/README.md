# server/test-utils

Shared helpers for the server-side `bun:test` suite. All server tests run in a
single `bun test` process, so anything mutable that escapes a test file
(module mocks, spies, singletons, `CONFIG`) leaks into every file that runs
after it — these helpers exist to make that impossible for the common cases.

## `setup.ts` — in-memory test database

```ts
import { setupTestDb, teardownTestDb } from "../test-utils/setup";

beforeEach(() => setupTestDb());
afterAll(() => teardownTestDb());
```

- Importing `setup.ts` sets `CONFIG.DB_PATH = ":memory:"` as a module
  side effect, so the test process can never touch a real database file.
- `setupTestDb()` resets the DB singletons and initializes a fresh in-memory
  SQLite database. The **first** call runs the full Drizzle migration chain and
  caches a serialized snapshot of the migrated DB; every later call (across all
  test files in the process) restores from that snapshot instead of replaying
  migrations, which keeps the suite fast.
- `teardownTestDb()` resets the singletons again.
- Gotcha: never top-level-`await` a DB-dependent function in a test file — it
  runs at module load, before any `beforeEach(setupTestDb)` hook has fired.

## `fixtures.ts` — typed test data factories

Factories for TMDB-shaped objects, each accepting a `Partial<T>` overrides
argument: `makeParsedTitle`, `makeParsedOffer`, `makeTmdbMovieDetails`,
`makeTmdbTvDetails`, `makeTmdbDiscoverMovie`, `makeTmdbDiscoverTv`,
`makeTmdbSearchMultiMovie`, `makeTmdbSearchMultiTv`. Prefer these over inline
object literals so shape changes only need fixing in one place.

## `auth.ts` — authenticated requests

`createTestSession(opts?)` creates a user + session in the test DB and returns
`{ userId, token, cookieHeader }`. Pass `cookieHeader` to Hono's
`app.request(path, { headers: { Cookie: cookieHeader } })` to exercise
`requireAuth` / `requireAdmin` routes. Options: `username`, `isAdmin`,
`authProvider`, `providerSubject`.

## `config.ts` — CONFIG mutation guard

**Rule: never mutate `CONFIG` in a test without `withConfigGuard()`.**

`CONFIG` (from `server/config.ts`) is a process-wide mutable singleton. A test
that sets `CONFIG.BASE_URL` and forgets to restore it silently changes behavior
for every test that runs afterwards — including tests in _other files_, in an
order that differs between local runs and Linux CI.

```ts
import { withConfigGuard } from "../test-utils/config";

describe("my feature", () => {
  withConfigGuard(); // snapshot before each test, restore after each test

  it("uses a custom base URL", () => {
    CONFIG.BASE_URL = "https://example.com"; // restored automatically
    // ...
  });
});
```

- Calling `withConfigGuard()` inside a `describe` scopes the hooks to that
  describe; calling it at file top level guards the whole file.
- `snapshotConfig()` / `restoreConfig(snapshot)` are exported for the rare case
  where you need manual control (e.g. inside a single hook).

## Cache gotcha

Routes that call `getCache()` (browse, details, search, …) throw
`"Cache not initialized"` unless the test initializes the singleton first:

```ts
import { initCache } from "../cache";
import { MemoryCache } from "../cache/memory";

beforeEach(() => {
  setupTestDb();
  initCache(new MemoryCache(1000));
});
```

See `server/routes/browse.test.ts` for the full pattern.
