# Frontend guidance

## Stack

- **React 19** + Vite + **Tailwind CSS 4** + shadcn/ui + react-router + Vite PWA
- TypeScript strict mode; ESLint with zero errors and zero warnings
- Testing: `@testing-library/react` with `happy-dom` (preloaded in `frontend/src/test-utils/setup.ts`)
- No external test frameworks — use `bun:test` built-in

## Entry points

| File                    | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `frontend/src/main.tsx` | App entry with BrowserRouter + ErrorBoundary + AuthProvider           |
| `frontend/src/App.tsx`  | Lazy-loaded route tree with RequireAuth guards                        |
| `frontend/src/api.ts`   | API client functions for all backend routes (uses `fetchJson` helper) |
| `frontend/src/types.ts` | Title/Offer/Provider types + `normalizeSearchTitle()`                 |
| `frontend/src/sw.ts`    | Service worker (Workbox strategies + BackgroundSync + push handler)   |

## Key patterns

**snake_case ↔ camelCase bridge**: DB titles use `snake_case`; TMDB API search results use `camelCase`. `normalizeSearchTitle()` in `frontend/src/types.ts` bridges the gap for unified rendering. When a UI field looks wrong, check both the DB shape and TMDB shape before assuming a backend bug.

**401 handling**: `fetchJson` in `api.ts` dispatches an `"auth:unauthorized"` CustomEvent on 401. `AuthContext.tsx` listens for it and redirects to login. Never handle 401 manually in components.

**Avoiding `any`**: use `unknown` for catch blocks and proper types elsewhere. ESLint enforces this. Test files are exempt from `no-explicit-any`.

## Data fetching (TanStack Query)

Server-cache state lives in `@tanstack/react-query`. The `QueryClient` singleton is in `lib/queryClient.ts` (staleTime 30s, gcTime 5m, retry 1) and is mounted in `main.tsx`. Functions in `api.ts` are the raw fetchers — they belong inside `queryFn`/`mutationFn`, never called directly from a component's `useEffect`.

**Reads → `useQuery`**: Any GET that renders server data.

- `queryFn: ({ signal }) => api.foo(signal)` — always forward the `signal` for cancellation
- Use a structured array key; **reuse an existing key when components share data** (e.g. `["filters"]`, `["stats"]`)
- Gate auth-dependent queries with `enabled`
- Read `isLoading` / `isError` / `data` instead of manual loading/error state
- Reference: `HomePage.tsx` (`["home","auth"]` query, line ~297)

**Writes → `useMutation`** with optimistic update + invalidation:

- `onMutate`: `cancelQueries` → snapshot via `getQueryData` → `setQueryData` optimistic → return snapshot
- `onError`: roll back from snapshot + `toast.error`
- `onSettled`: `invalidateQueries` for **every** affected key (e.g. a watch toggle invalidates `["stats"]`, `["activity"]`, `["calendar"]`, `["home","auth"]`)
- Reference: `HomePage.tsx` `toggleWatchedMutation` (line ~333)

**Keep a raw `api.ts` call (no Query) when**:

- One-shot imperative action with no cached view to update (file import/export, token download, share-link copy)
- Auth/session flow owned by `AuthContext` / better-auth
- The call is _inside_ a `queryFn` or `mutationFn` — that is the correct home for `api.ts`

**Deferred — do NOT migrate yet**: Settings-tab **form-value submit** handlers (`updateMyProfile`, `updateAdminSettings`, `updateAppearanceSettings`, `updateHomepageLayout`, `updateCrowdedWeekSettings`, `updateDepartureAlertSettings`) wait for the planned react-hook-form work. Their reads and action writes (delete/test/trigger/regenerate) are fair game now.

**Tests**: Every migrated component's colocated test must wrap in a fresh `new QueryClient({ defaultOptions: { queries: { retry: false } } })` provider (see any existing `*.test.tsx` for the pattern).

## Pages (`frontend/src/pages/`)

| File                                                                     | Purpose                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `HomePage.tsx`                                                           | Browse + search landing with customizable layout       |
| `BrowsePage.tsx`                                                         | Category browsing + filters                            |
| `CalendarPage.tsx`                                                       | Monthly episode calendar grid                          |
| `DiscoveryPage.tsx`                                                      | Personalized discovery feed                            |
| `TrackedPage.tsx`                                                        | Watchlist + stats view                                 |
| `StatsPage.tsx`                                                          | User statistics                                        |
| `ReelsPage.tsx`                                                          | Swipeable short-form discovery                         |
| `TitleDetailPage.tsx` / `SeasonDetailPage.tsx` / `EpisodeDetailPage.tsx` | Content detail pages                                   |
| `PersonPage.tsx`                                                         | Actor/crew details and filmography                     |
| `UserProfilePage.tsx`                                                    | Public user profile                                    |
| `ProfilePage.tsx`                                                        | Current user; redirects to UserProfilePage             |
| `SettingsPage.tsx`                                                       | Notifiers, integrations, password, invitations, layout |
| `InvitePage.tsx`                                                         | Create/manage invitations                              |
| `LoginPage.tsx`                                                          | Local + passkey + OIDC login                           |
| `SignupPage.tsx`                                                         | Local signup                                           |
| `MorePage.tsx`                                                           | Mobile-only menu overlay                               |
| `AdminUsersPage.tsx`                                                     | Admin user management                                  |
| `NotFoundPage.tsx`                                                       | 404 fallback                                           |

## Components (`frontend/src/components/`) — broad groups

- **Title display**: `TitleCard`, `TitleList`, `NewReleases`, `FullBleedCarousel`, `HeroBanner`, `ScrollableRow`, `CategoryBar`, `CategoryBrowse`, `AgendaCalendar`
- **Filters/search**: `FilterBar`, `MultiSelectDropdown`, `SearchBar`, `UserSearchDropdown`
- **Actions**: `TrackButton`, `WatchButton`, `WatchButtonGroup`, `WatchedToggleButton`, `RatingButtons`, `EpisodeRatingButtons`, `FollowButton`, `RecommendButton`, `ShareButton`, `VisibilityButton`, `StatusPicker`, `TagList`, `NotificationModePicker`
- **Episode/reels**: `EpisodeComponents`, `EpisodeShowCard`, `ReelsCard`, `ReelsSeasonPanel`, `ReelsUndoBar`
- **Navigation/shell**: `BottomTabBar`, `RequireAuth`, `ErrorBoundary`, `ScrollToTop`, `SkeletonComponents`, `OfflineIndicator`, `InstallPrompt`, `NotificationPrompt`, `KeyboardShortcutsModal`, `ThemePicker`
- **People**: `PersonCard`, `ExternalLinks`, `ProfileBanner`
- **Utilities**: `loadFilters.ts`, `useDominantColor.ts`
- **Design system**: `design/Chip`, `design/Kicker`, `design/PageHeader`, `design/Pill`
- **shadcn/ui primitives** (`ui/`): `alert-dialog`, `button`, `calendar`, `skeleton`, `tabs`

## Context / Hooks / Lib

- `context/AuthContext.tsx` — Session state, providers, login/signup/logout; listens for `"auth:unauthorized"` CustomEvent
- `hooks/` — `useApiCall`, `useGridNavigation`, `useInstallPrompt`, `useIsMobile`, `useKeyboardShortcut`, `usePushSubscriptionSync`, `useScrollRestoration`, `useTheme`
- `lib/` — `auth-client` (better-auth browser client), `push` (Web Push subscription), `groupShows`, `base64`, `utils`

## Linting

Run `bun run lint` from root (or `cd frontend && bun run lint`). Zero errors AND zero warnings required — CI fails on warnings too.
