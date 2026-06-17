# Phase 0 Research: Known For on Person Detail Page

All "NEEDS CLARIFICATION" items resolved. This feature is small and well-bounded;
the research below records the decisions that shaped the plan.

## Decision 1: Source of data — reuse the existing person payload

- **Decision**: Derive "Known For" entirely on the client from the data already
  returned by `GET /api/details/person/:personId`. No new endpoint, no new TMDB
  call.
- **Rationale**: The response (`PersonDetailsResponse` in
  `frontend/src/types.ts:422`) already includes
  `combined_credits.cast[]` and `combined_credits.crew[]`. Each credit
  (`PersonCastCredit` / `PersonCrewCredit`, `types.ts:393` / `:407`) carries
  exactly the fields "Known For" needs: `id`, `media_type`, `title`/`name`,
  `poster_path`, `release_date`/`first_air_date`, and `popularity`. TMDB already
  appends `combined_credits` to the person fetch
  (`server/tmdb/client.ts:176`). There is nothing left to fetch.
- **Alternatives considered**:
  - _Use TMDB's own `known_for` array_ (present on person search/list results,
    not on the detail+`combined_credits` response). Rejected: it is not part of
    the data the detail page receives, would require a server change to surface,
    and the spec's Assumptions explicitly say to reuse the existing
    popularity/notability signal already ordering the credit rows.
  - _New `/api/details/person/:id/known-for` endpoint._ Rejected as pure
    overhead: it would add a route (and the `index.ts` ↔ `worker.ts` parity
    obligation) to compute something trivially derivable from data the client
    already holds.

## Decision 2: Ranking signal — `popularity` descending

- **Decision**: Rank the merged cast+crew credits by `popularity` descending and
  take the top N.
- **Rationale**: `PersonPage.tsx:124-133` already sorts both the Acting and Crew
  rows by `b.popularity - a.popularity`. Spec FR-003 and the Assumptions section
  require "the same popularity/notability signal already used to order the
  existing rows." Using `popularity` keeps "Known For" consistent with the rows
  beneath it and introduces no new heuristic.
- **Alternatives considered**: `vote_count`, `vote_average`, or a composite
  score. Rejected — not what the existing rows use; would diverge from the rest
  of the page and contradict the spec's stated assumption.

## Decision 3: Cross-role de-duplication by title identity

- **Decision**: Merge cast and crew, then de-duplicate by the title key
  `movie-${id}` / `tv-${id}` (the same key `creditTitleId` produces). Keep the
  first (highest-popularity) occurrence after sorting.
- **Rationale**: The existing `deduplicateCast` (by `id`) and `deduplicateCrew`
  (by `id`+`job`) dedupe _within one list only_. A person who both acted in and
  directed the same film has that film in both lists; FR-005 / SC-002 require it
  to appear at most once in "Known For". Keying on `media_type`+`id` also avoids
  collapsing a movie and a TV show that happen to share a numeric TMDB id.
- **Alternatives considered**: Dedupe by numeric `id` only (rejected: a movie and
  a show can share an id across TMDB's separate id spaces); dedupe by title
  string (rejected: fragile, and remakes/same-name titles would wrongly merge).

## Decision 4: Cap = 10, render fewer when fewer exist

- **Decision**: Single named constant `KNOWN_FOR_LIMIT = 10`. Slice the ranked,
  de-duplicated list to at most that many; never pad.
- **Rationale**: FR-004 sets a small fixed maximum (default 10) and requires
  fewer when the person has fewer credits. A named constant makes the "adjustable
  default" from the Assumptions trivial to change.
- **Alternatives considered**: Larger caps (20+) — rejected as defeating the
  "at-a-glance" purpose (SC-004). A configurable/per-user setting — rejected;
  spec states the feature is presentation-only with no per-user configuration.

## Decision 5: Reuse `CreditCard` + `ScrollableRow` for parity

- **Decision**: Render "Known For" with the existing local `CreditCard` inside
  the shared `ScrollableRow`, identical to the Acting/Crew sections.
- **Rationale**: FR-009 requires visual and behavioral parity (card style,
  horizontal scroll, click-to-navigate). Reusing the same components guarantees
  parity for free and avoids new styling. `CreditCard` already handles the poster
  text fallback (FR-007, `PersonPage.tsx:71-75`) and omits the year when no date
  is present (`:81-85`). The subtitle slot reuses the credit's role
  (`character` for cast, `job` for crew).
- **Alternatives considered**: A bespoke "Known For" card. Rejected — duplicates
  styling and risks visual drift from the rows it sits above.

## Decision 6: Hide the section entirely when empty

- **Decision**: When the ranked, de-duplicated set is empty, render nothing (no
  header).
- **Rationale**: FR-008 and the "Person with no credits" edge case. Mirrors the
  existing `castCredits.length > 0` / `crewCredits.length > 0` guards already in
  `PersonPage.tsx:225,243`. The existing not-found / error handling
  (`PersonPage.tsx:108-114`) is untouched, satisfying the "Data unavailable" edge
  case.

## Decision 7: Testability — extract a pure selection helper

- **Decision**: Implement the merge + dedupe + rank + cap as a pure exported
  function (e.g. `selectKnownFor(credits, limit)`) and unit-test it directly.
- **Rationale**: Constitution I requires tests for new behavior. A pure function
  is testable with `bun:test` without rendering or a DOM — fast and deterministic.
  The component then simply maps the helper's output to `CreditCard`s. The
  existing `PersonPage.test.ts` already imports the credit types and is the
  natural home for these tests.
- **Alternatives considered**: Testing only through the rendered component
  (`@testing-library/react`). Acceptable but heavier; a pure helper is the
  cleaner unit and still leaves room for a light render assertion if desired.
