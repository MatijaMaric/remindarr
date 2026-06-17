# Implementation Plan: Known For on Person Detail Page

**Branch**: `002-person-known-for` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-person-known-for/spec.md`

## Summary

Add a "Known For" section near the top of the person detail page that highlights
the handful of titles a person is most recognized for, so a user can grasp who
the person is without scrolling their entire filmography.

This is a **frontend-only, presentation-layer change**. The data needed already
arrives with the existing person payload: `GET /api/details/person/:personId`
returns `combined_credits.cast[]` and `combined_credits.crew[]`, each entry
carrying `popularity`, `poster_path`, title/name, and release/air date.
`PersonPage.tsx` already sorts those lists by `popularity` descending and renders
them through `CreditCard` inside a `ScrollableRow`. "Known For" reuses that exact
machinery: merge cast + crew, de-duplicate by title identity, rank by
`popularity`, take the top N (default 10), and render the same card row above the
existing Acting and Crew sections.

**No server change. No new endpoint. No schema change. No new dependency.** The
work is contained to `frontend/src/pages/PersonPage.tsx` (derive + render) plus a
colocated unit test for the selection/de-duplication logic, which is extracted to
a small pure helper so it is testable without a DOM.

## Technical Context

**Language/Version**: TypeScript (strict mode), React 19

**Primary Dependencies**: React 19 + Vite + Tailwind 4 + react-router + TanStack
Query (frontend only). Reuses existing `ScrollableRow` component, `CreditCard`
(local to `PersonPage.tsx`), and `lib/tmdb-images`.

**Storage**: None. Data is read from the existing person query
(`["person", personId]`); no persistence, no cache, no new fetch.

**Testing**: `bun:test` with `@testing-library/react` + happy-dom for any
component-level assertions; pure-function unit tests for the selection helper
(no DOM, no DB, no network). No TMDB/HTTP involved on the frontend path.

**Target Platform**: Browser (frontend). Because there is no server code, dual
Bun/CF runtime parity is not engaged by this change.

**Project Type**: Web application (frontend + server in one repo); this feature
touches only `frontend/`.

**Performance Goals**: "Known For" visible without scrolling immediately on page
render (SC-001, SC-004). Selection runs over an already-fetched, in-memory array
(tens to low-hundreds of credits) — negligible cost, memoized with `useMemo`.

**Constraints**: Must not alter or remove the existing Acting/Crew sections
(FR-010, SC-005); must hide entirely when the person has no credits (FR-008);
must show at most 10 titles, each at most once (SC-002).

**Scale/Scope**: One section added to one page. Default cap of 10 titles. Single
new pure helper + its test; no new files required beyond the test (helper can be
colocated in `PersonPage.tsx` or a small sibling module).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                       | Status  | Notes                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-Driven Quality (NON-NEGOTIABLE)         | ✅ PASS | New behavior (selection + de-duplication + cap) extracted to a pure helper with colocated `bun:test` unit tests covering: ranking order, cross-role de-duplication, cap at 10, fewer-than-10, no-credits → empty. No network/DB to mock. |
| II. Dual-Runtime Parity (Bun + CF)              | ✅ N/A  | No server code changes. No routes added/modified, so the `index.ts` ↔ `worker.ts` invariant is untouched. Parity is structurally preserved.                                                                                              |
| III. Database Migration Safety (NON-NEGOTIABLE) | ✅ N/A  | No schema change, no migration, no DB access. `migrations.test.ts` unaffected.                                                                                                                                                           |
| IV. Type Safety & Lint Discipline               | ✅ PASS | Helper is typed against existing `PersonCastCredit \| PersonCrewCredit` unions in `frontend/src/types.ts`; no `any`; frontend must pass ESLint with zero warnings.                                                                       |
| V. Observability & Structured Logging           | ✅ N/A  | Frontend presentation only; no server paths, jobs, or logs introduced. (Frontend may use `console.error` per guidance, but this feature has no error path of its own.)                                                                   |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-person-known-for/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── known-for-ui.md  # UI contract for the Known For section
├── checklists/
│   └── requirements.md  # (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/
└── src/
    └── pages/
        ├── PersonPage.tsx        # + selectKnownFor() helper + <KnownFor> section
        │                         #   rendered above the Acting/Crew sections
        └── PersonPage.test.ts    # + unit tests for selectKnownFor()
                                   #   (ranking, cross-role dedupe, cap, empty)
```

**Structure Decision**: Web application layout; the change is confined to the
existing `frontend/src/pages/PersonPage.tsx` and its colocated test. No new
top-level directories, no new components are strictly required — the existing
local `CreditCard` and the shared `ScrollableRow` are reused. The selection logic
is the only genuinely new code and is implemented as a pure, exported helper so
it is unit-testable in isolation.

## Architecture Decisions (summary; see research.md)

1. **Frontend-only; reuse the existing person payload.** `combined_credits`
   already carries `popularity`, posters, titles, and dates. Computing "Known
   For" on the client from data already in memory avoids a new endpoint, a new
   TMDB call, and any server/runtime/migration surface entirely.
2. **Ranking = `popularity` descending.** This is the same signal `PersonPage`
   already uses to order Acting and Crew (`spec` Assumptions; FR-003). No new
   notability heuristic is introduced.
3. **De-duplicate across cast _and_ crew by title identity.** The existing
   `deduplicateCast`/`deduplicateCrew` helpers dedupe _within_ a single list;
   "Known For" merges both lists and dedupes by the `movie-N` / `tv-N` title key
   (the same key `creditTitleId` already produces for navigation), so a title a
   person both acted in and directed appears once (FR-005, SC-002).
4. **Cap via a single named constant (default 10), render fewer when fewer
   exist.** No padding (FR-004, edge cases).
5. **Reuse `CreditCard` + `ScrollableRow` for visual/behavioral parity.** Same
   poster fallback, same year handling, same horizontal scroll, same
   click-to-navigate (FR-006, FR-007, FR-009). The "Known For" subtitle reuses
   the credit's role (character or job) where available.
6. **Hide when empty.** When the merged, de-duplicated set is empty the section
   renders nothing — no header (FR-008), mirroring how Acting/Crew already guard
   on `length > 0`.

## Complexity Tracking

No constitution violations — section intentionally empty.
