Scaffold a new React page for remindarr.

**Usage**: `/new-page <Name>`

Example: `/new-page Analytics`

**Read before generating:**

1. `frontend/src/App.tsx` — lazy-load and route patterns, RequireAuth usage
2. `frontend/CLAUDE.md` — stack, TanStack Query patterns, design system primitives
3. `frontend/src/api.ts` — if the page needs server data, add a fetcher here following the existing pattern

**What to generate:**

1. **`frontend/src/pages/<Name>Page.tsx`**:
   - Lazy-loadable — no top-level side effects, no blocking imports
   - Use `design/PageHeader` for the page title where applicable
   - Server data via `useQuery` (see `frontend/CLAUDE.md` lines 27–51): forward `{ signal }`, structured array key, `isLoading` / `isError` / `data`
   - Tailwind CSS 4 only — no inline styles, no CSS modules

2. **`frontend/src/pages/<Name>Page.test.tsx`**:
   - Wrap in `new QueryClient({ defaultOptions: { queries: { retry: false } } })` provider
   - Mock API calls — never make real HTTP calls in tests
   - At minimum: renders without crashing, key content visible

3. **Wire into `frontend/src/App.tsx`**:
   - `const <Name>Page = React.lazy(() => import("./pages/<Name>Page"))`
   - Add the route entry with `<RequireAuth>` if authentication is required
   - Follow the existing pattern of the nearest equivalent page — do not invent new structure

**After generating:** run `bun run check` and report pass/fail. Fix before reporting done.
