# UX Review Fixes — Design Spec

**Date:** 2026-05-24  
**Source:** GitHub issues tagged `ux-review` (28 issues, auto-filed by `/ux-review` on 2026-05-24)  
**Report:** `docs/ux-reviews/2026-05-24-ux-review.md`  
**Strategy:** One PR per issue cluster (8 PRs total)  
**Severity scope:** All severities (critical, major, minor)

---

## Approach

All 28 UX review issues decompose into 8 focused PRs. PRs 1–3 address cross-site global issues (highest ROI); PRs 4–8 address page-specific findings.

Branch naming: `claude/NNN-ux-pr-N-<slug>` where NNN = highest-numbered issue in the cluster.

---

## PR 1 — Global Accessibility (Contrast)

**Files:** `frontend/src/components/BottomTabBar.tsx`, `frontend/src/App.tsx`, `frontend/src/components/MediaCard.tsx`, any other shared component using `text-zinc-500` on dark backgrounds.

**Changes:**

| Component        | Problem                                                                                                       | Fix                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `BottomTabBar`   | Inactive tab labels `text-zinc-500` on `bg-zinc-900/72` = 3.8:1                                               | Change inactive class to `text-zinc-400`                            |
| `App.tsx` footer | `text-zinc-500` on `#09090b` = 4.12:1                                                                         | Change to `text-zinc-400`                                           |
| `App.tsx` nav    | Logout `text-zinc-400`, search placeholder/⌘K `opacity-60 text-zinc-400`/`opacity-75` — low contrast at 640px | Bump Logout to `text-zinc-300`; increase search placeholder opacity |
| `MediaCard`      | Year/runtime sub-labels `text-zinc-500` on `bg-zinc-900` = 3.67:1                                             | Change to `text-zinc-400`                                           |

**Issues closed:** portions of #926–953 (contrast on tab bar, footer, nav, media cards appearing on every page)

---

## PR 2 — Global Layout / Shell

**Files:** `frontend/src/App.tsx`, `frontend/src/components/profile/AchievementToast.tsx`, `frontend/src/nav-utils.ts`

**Changes:**

| Problem                                                | Fix                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile bottom tab bar overlaps page content at 320×568 | `<main>` already has `pb-20 sm:pb-6`; audit pages that add their own full-height container and don't inherit that padding                                                                                                                                |
| 640px white strip (right side of viewport unpainted)   | The `max-w-[1440px] mx-auto` container inside `<nav>` and `<main>` is correct; the issue is likely the `bg-zinc-950` not applied to the shell `div` at 100% width below the nav. Fix: ensure the root `div` has `min-h-screen w-full` and `bg-zinc-950`. |
| Achievement toast overlaps content at 320px            | Add a `×` dismiss button to `ToastItem`; raise `bottom-20` to `bottom-24` on mobile to clear the tab bar                                                                                                                                                 |
| Top nav shows "Sign In" link when already on `/login`  | In `App.tsx`, guard the `NavLink to="/login"` with `location.pathname !== "/login"`                                                                                                                                                                      |

**Issues closed:** portions of mobile layout findings across #926, #927, #928, #929, #930, #931, #932, #933, #935, #937, #940, #941, #944, #945, #946, #948, #949, #952, #936

---

## PR 3 — Auth / Functional Bugs on Public Routes

**Files:** `frontend/src/pages/AchievementsPage.tsx`, `frontend/src/pages/AchievementDetailPage.tsx`

**Problem:** Both pages are registered as public routes (`/u/:username/achievements` and `/u/:username/achievements/:key`) but their `useQuery` calls are gated by `enabled: !!user`. Unauthenticated visitors always see the empty/error state.

**Fix:**

- In `AchievementsPage`: when viewing another user's profile (`username` param present and `username !== user?.username`), remove the `!!user` gate — fire `getUserAchievements(username, signal)` regardless of auth state.
- In `AchievementDetailPage`: same pattern — the public URL `/u/:username/achievements/:key` should not require `user` to be set to fetch.
- The self-viewing path (`/achievements`) correctly stays behind `RequireAuth` in the router, so `!!user` is always true there anyway.

**Issues closed:** #950 (public achievements page empty for guests), #951 (achievement detail not-found for guests)

---

## PR 4 — Identity Pages (`/login`, `/signup`)

**Files:** `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/SignupPage.tsx`

### `/login` fixes

- "Sign up" anchor: contrast 2.8:1 against surrounding text → add `underline` decoration so it has a non-color visual distinction (satisfies `link-in-text-block` axe rule)
- "Sign in with username instead" button: style as a visible button/link (currently looks like disabled body copy on mobile)
- Nav "Sign In" redundancy: handled in PR 2

### `/signup` fixes

- Change `<h2>` "Create an account" to `<h1>` (page currently has no `<h1>`)
- "Already have an account?" paragraph: `text-zinc-400` contrast fix (also applies to its "Sign in" link → add underline)
- Password field: add show/hide visibility toggle (eye icon button)
- Below password field: add "Minimum 8 characters" hint text
- "Display Name" field: append "(optional)" to label

**Issues closed:** #936, #942

---

## PR 5 — Content Pages (`/title/*`, `/person/:id`, `/kiosk/:token`)

**Files:** `frontend/src/pages/TitleDetailPage.tsx`, `frontend/src/pages/SeasonDetailPage.tsx`, `frontend/src/pages/EpisodeDetailPage.tsx`, `frontend/src/pages/PersonPage.tsx`, `frontend/src/pages/KioskPage.tsx`

### Title detail (`/title/movie-603`, `/title/tv-1399`) — issues #944, #945

- IMDB/TMDB "/10" suffix spans and "YOUR RATING" label: contrast fix (`text-zinc-500` → `text-zinc-400`)
- Fix "IMOB" typo → "IMDB" (issue #944)
- Mobile tab bar overlap: ensure page content has `pb-20 sm:pb-0` (or inherits from `<main>`)

### Season detail (`/title/:show/season/:n`) — issue #946

- Episode thumbnail placeholder labels ("E01", "E02"): `text-zinc-600 on bg-zinc-800` = 1.92:1 → change to `text-zinc-300`
- Episode overview text `text-zinc-500` → `text-zinc-400`
- Share button missing at 640×1024: investigate `hidden sm:block` / `sm:hidden` boundary

### Episode detail (`/title/:show/season/:n/episode/:n`) — issue #947

- Max-width at 1920px: add `max-w-4xl mx-auto` constraint
- h1 format: separate season-episode code from episode title visually (e.g. `<span class="text-zinc-500">S01E01</span> Episode Name`)
- Add episode still fallback placeholder when `still_path` is null
- Logged-out visitor: show a "Sign in to rate this episode" prompt
- Contrast fixes (footer, tab bar handled globally)

### Person page (`/person/:id`) — issue #938

- Credit card fallback text (`text-zinc-600 on bg-zinc-800` = 1.92:1) → `text-zinc-300`
- "Born:" / "From:" label contrast fix
- Add back-navigation: breadcrumb or back `<button onClick={() => history.back()}`
- No loading skeleton at desktop viewports: add skeleton for the content sections

### Kiosk (`/kiosk/:token`) — issue #934

- Replace inline `padding: "20px 56px"` / `margin: "24px 56px 0"` with responsive Tailwind classes
- "Cast to TV" button: if `aria-hidden="true"`, add a visible tooltip explaining it is non-functional, or remove `aria-hidden` and set `aria-disabled="true"` with a descriptive label
- Contrast fixes for badge, footer spans, panel counters, episode codes
- Footer metadata: don't truncate on mobile (use `text-xs break-words` or omit non-critical info)

**Issues closed:** #944, #945, #946, #947, #938, #934

---

## PR 6 — Core Feature Pages (`/browse`, `/calendar`, `/tracked`, `/reels`, `/settings`)

**Files:** `BrowsePage.tsx`, `CalendarPage.tsx`, `TrackedPage.tsx`, `ReelsPage.tsx`, `SettingsPage.tsx`, and their sub-components

### `/browse` — issue #930

- Filter card label divs `text-zinc-500` → `text-zinc-400`
- "Sign In" tab-bar label: handled globally (PR 1)
- "Loading…" fallback: add an error/retry state for when the query fails

### `/calendar` — issue #931

- Desktop weekday column headers: `text-zinc-500` → `text-zinc-400`
- Legend labels and footer text: `text-zinc-500` → `text-zinc-400`
- Day-item count badge contrast fix
- Mobile: add `aria-label` to "Hide watched" eye-button, prev/next week buttons
- Mobile calendar: wrap month name `<div>` in `<h1>`

### `/tracked` — issues #948, #949

- `···` ellipsis button in `RowActionsMenu`: add `aria-label="More actions"`
- Sort `<select>` `aria-label`: use real translated string instead of raw i18n key
- Column headers (`text-zinc-500` on `bg-zinc-950`): → `text-zinc-400`
- Row sub-labels (`text-zinc-500` on `bg-zinc-900`): → `text-zinc-400`
- `?view=stats` at 320px: investigate why URL param is not respected on first render
- Missing stat cards at 320px: check responsive grid — likely needs `grid-cols-1` on xs

### `/reels` — issue #939

- At 640px, both desktop top nav and bottom tab bar show: fix breakpoint — tab bar has `sm:hidden`, nav has `sm:block`; the issue is 640px sits at both breakpoints. `sm:` prefix = 640px+ in Tailwind. The tab bar `sm:hidden` means it hides at ≥640px, the nav shows at ≥640px (via `sm:block`). This is correct behavior; the issue is that the reels page hides the nav with `isReelsPage ? "hidden sm:block"` meaning it shows at sm+. So at exactly 640px, both appear. Fix: make reels treat 640px as mobile too (change the nav show threshold for reels to `md:block` or `lg:block`).
- "Mark as Watched" CTA absent at 320×568: investigate `ReelsCard` rendering at this breakpoint
- "SWIPE FOR NEXT" hint: hide on non-touch / pointer:fine devices (CSS `@media (pointer: fine)`)

### `/settings` — issue #940

- Breadcrumb `/settings` span: `text-zinc-500 opacity-60` combined ≈ 2.15:1 → increase opacity or use `text-zinc-300`
- "Manage invite codes" helper text: `text-zinc-500` at 11px → `text-zinc-400`
- "TMDB · en-US" build-info: `text-zinc-500` → `text-zinc-400`
- Tab clip at 320px: use `overflow-x-auto` + `scrollbar-hide` on the settings tab bar
- Settings form fields max-width at 1920px: constrain with `max-w-2xl` on the content column

**Issues closed:** #930, #931, #948, #949, #939, #940

---

## PR 7 — Social / Achievement Pages (`/achievements`, `/u/*`, `/more`, `/leaderboard`)

**Files:** `AchievementsPage.tsx`, `AchievementDetailPage.tsx`, `UserOverlapPage.tsx`, `MorePage.tsx`, `LeaderboardPage.tsx`

### `/achievements` — issue #927

- `<h1>` "Achievements" contrast: `text-zinc-100` or appropriate high-contrast token (currently fails at 4.12:1 — likely `text-zinc-400` was used somewhere)
- Progress counter and section kicker: `text-zinc-500` → `text-zinc-400`
- Timestamp "7d ago": `text-zinc-500` at 10px = 4.12:1 — use `text-zinc-400`
- Toast overlap at 320px: handled in PR 2

### `/achievements/:key` and `/u/:username/achievements/:key` — issues #951, #928

- "Back" link contrast 1.52:1: add `underline` or increase contrast
- No loading state: add a loading skeleton while query fires
- Auth gate removed in PR 3

### `/u/:user/overlap/:friend` — issue #952

- Toast overlap: handled in PR 2
- Media card year/runtime contrast: handled in PR 1
- "0 X's only" possessive: fix copy to handle usernames ending in "s" — use `username.endsWith('s') ? `${username}'` : `${username}'s``
- Heading order: `<h3>` card titles without preceding `<h2>` — add `<h2>` section headings (e.g. "In common", "Yours only") above the card grids

### `/achievements/movies_10` and achievement detail — issue #928

- Page occupies small vertical region at desktop: add `min-h-[60vh]` to the page container
- Ladder rung dots: add `aria-label` per rung (e.g. "Level 3 of 5: Watch 30 movies") or a visible legend
- Constraint column max-width at 1920px

### `/more` — issue #937

- Toast overlap: handled in PR 2
- Section heading labels `text-[10px] text-zinc-500`: → `text-zinc-400`
- Subtitle `text-zinc-500` → `text-zinc-400`
- Username handle `text-zinc-500` → `text-zinc-400`
- Add `<h1>` (e.g. "Menu")
- Desktop redirect: `/more` redirects to `/reels` on desktop — add an explanatory comment or redirect message briefly before redirect (currently silent)

### `/leaderboard` — issue #935

- Migrate `LeaderboardPage` from `useEffect`/`useState` to `useQuery` (TanStack Query adoption)
- White strip at 640px: handled in PR 2
- Badge count labels contrast: `text-zinc-500` → `text-zinc-400`
- Podium cards: wrap each in a `<Link to={/user/${username}}>` so they navigate to the user profile

**Issues closed:** #927, #928, #935, #937, #950, #951, #952

---

## PR 8 — Support Pages (`/discovery`, `/invite`, `/admin/users`, `/share/*`, `/404`)

**Files:** `DiscoveryPage.tsx`, `InvitePage.tsx`, `AdminUsersPage.tsx`, `SharedWatchlistPage.tsx`, `NotFoundPage.tsx`

### `/discovery` — issue #932

- White strip at 640px: handled in PR 2
- Empty-state: add a `<Link to="/browse">Browse titles</Link>` CTA when the feed is empty
- `PageHeader` kicker and "For you" tab: pass through `t()` for i18n
- `becauseLabel()` strings: extract to i18n keys

### `/invite` — issue #933

- White strip at 640px: handled in PR 2
- Active nav highlight: add `/invite` to the nav link set in `App.tsx` (if not already there)
- Contrast fixes (empty-state paragraph, tab bar): handled globally

### `/admin/users` — issue #929

- "User" role badge: `text-zinc-500 on bg-zinc-700` = 3.98:1 → use `text-zinc-100` or a higher-contrast token
- Username / email / "you" label contrast: → `text-zinc-300`
- JOINED date: → `text-zinc-300`
- Icon buttons (Shield, ShieldOff, Trash2): add `aria-label` to each
- Toast overlap at 320px: handled in PR 2
- Action button tap targets: wrap icon-only buttons in a `min-w-[44px] min-h-[44px]` container

### `/share/watchlist/:token` — issue #941

- Tab bar overlap: handled in PR 2
- Media card year labels: handled in PR 1
- "sign in to track these titles" subtitle: add `<Link to="/login">sign in</Link>` around the sign-in mention
- Inline footer "Powered by Remindarr": remove the page-level inline footer (the global app-shell footer already provides this at desktop)

### `/404` — issue #943

- Change `<h1>404</h1>` → `<h1>Page not found</h1>`; move "404" to a styled `<p aria-hidden="true">` above
- Contrast: "404" as large decorative text needs ≥3:1 (large text rule); "Page not found" description paragraph `text-zinc-500` → `text-zinc-400`
- Footer contrast: handled globally
- Add two navigation links below "Go back home": link to `/browse` and link to `/`

### `/user/:username` — issue #953

- Full-page skeleton on mobile: investigate why `UserProfilePage` never resolves its loading state on mobile (likely a query that never fires or a viewport-conditional data fetch)
- Add `<h1>` containing the user's display name / username
- Sidebar/stat card misalignment at 1280px: audit the two-column layout breakpoint

**Issues closed:** #926 (partial), #929, #932, #933, #941, #943, #953

---

## Shared Decisions

- **Contrast token mapping:** `text-zinc-500` → `text-zinc-400` for body/secondary text; `text-zinc-600` on dark backgrounds → `text-zinc-300` minimum.
- **Tab bar overlap:** All pages that render a full-height inner container (not using the global `<main>` padding) must add `pb-20 sm:pb-0` themselves.
- **i18n gaps:** Hard-coded English strings should be wrapped in `t()` calls. New keys go into the default i18n namespace.
- **Tests:** Every changed component needs its colocated `.test.tsx` updated or a regression test added.
- **CI:** Run `bun run check` before each PR.

---

## Issue → PR Mapping

| Issues                                    | PR   |
| ----------------------------------------- | ---- |
| Global contrast findings across all pages | PR 1 |
| Mobile layout, tab bar, toast, nav login  | PR 2 |
| #950, #951 (public routes auth-gated)     | PR 3 |
| #936, #942                                | PR 4 |
| #934, #938, #944, #945, #946, #947        | PR 5 |
| #930, #931, #939, #940, #948, #949        | PR 6 |
| #927, #928, #935, #937, #952              | PR 7 |
| #926, #929, #932, #933, #941, #943, #953  | PR 8 |
