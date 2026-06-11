# frontend/src/test-utils

Shared infrastructure for the frontend `bun:test` suite
(`@testing-library/react` + happy-dom).

## `apiMock.ts` — the one and only `../api` mock

`apiMock.ts` is a **complete** mock of every export of `frontend/src/api.ts`,
registered once via `mock.module("../api", …)` with shared singleton mock
functions. **No test file may declare its own `mock.module("../api", …)`** —
partial or otherwise.

Why it must be complete and shared: Bun does not reset `mock.module()`
registrations between test files in a single `bun test` process, and there is
no way to un-mock. On Linux CI (where test-file discovery order differs from
local) a _partial_ `../api` mock declared in one file leaks globally into every
other file, producing two failure modes:

1. **Wrong-instance binding** — a component's live `import * as api` namespace
   points at another file's mock, so resolved data / call counts are wrong.
2. **Load-time `SyntaxError: Export named 'X' not found`** — a static
   `import { X } from "../api"` (e.g. AuthContext's `getSubscriptions`) hits a
   partial mock that omits `X`.

Because this mock is complete, no static import ever fails; because the mock
instances are shared singletons, it doesn't matter which file's binding
"wins" — they all reference the same mocks.

### Usage rules

- **Import order**: import `apiMock` BEFORE importing the component/page under
  test, so the mock is registered before the component binds its `../api`
  namespace:

  ```tsx
  import { apiMock, resetApiMock } from "../test-utils/apiMock";
  import { MyPage } from "./MyPage"; // AFTER apiMock
  ```

- **Per-test overrides** go on the shared instances:

  ```ts
  apiMock.getTrackedTitles.mockResolvedValue({ titles: [someTitle] });
  ```

- **`resetApiMock()` in `afterEach`** — resets call history AND restores every
  default implementation, so per-test `mockResolvedValue` overrides don't bleed
  into the next test:

  ```ts
  afterEach(() => {
    cleanup();
    resetApiMock();
  });
  ```

- New exports added to `api.ts` must also be added to the `defaults` table in
  `apiMock.ts` with a realistic empty-shape default.

See the header comment in `apiMock.ts` for the full background.

## `setup.ts` — happy-dom preload

Preloaded for every frontend test run (see `frontend/bunfig.toml`). It registers
happy-dom globals so `document`/`window` exist, then restores Bun's native
`fetch`, `Request`, `Response`, `URL`, streams, etc. that happy-dom would
otherwise overwrite. It also polyfills Vite define constants
(`__APP_VERSION__`). Tests never import it directly.

## TanStack Query convention

Components under test that use `useQuery`/`useMutation` must be wrapped in a
**fresh `QueryClient` per test** with retries disabled, so failures surface
immediately instead of retrying, and no query cache leaks between tests:

```tsx
function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

render(
  <QueryClientProvider client={makeClient()}>
    <MyComponent />
  </QueryClientProvider>,
);
```

See `frontend/src/components/CategoryBrowse.test.tsx` for a full example of
all of the above together.
