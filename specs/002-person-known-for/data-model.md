# Phase 1 Data Model: Known For on Person Detail Page

No new persisted entities and no schema changes. This feature derives a view from
data already present in the client. The "model" here is the in-memory shape of
the inputs and the derived output.

## Existing inputs (already in `frontend/src/types.ts`)

### `PersonCastCredit` (`types.ts:393`)

| Field             | Type              | Notes                                        |
| ----------------- | ----------------- | -------------------------------------------- |
| `id`              | `number`          | TMDB title id                                |
| `media_type`      | `"movie" \| "tv"` | Distinguishes the id space                   |
| `title?`          | `string`          | Movie title (present for movies)             |
| `name?`           | `string`          | Show name (present for TV)                   |
| `character`       | `string`          | Role — used as the card subtitle             |
| `release_date?`   | `string`          | Movie date (year derived from first 4 chars) |
| `first_air_date?` | `string`          | TV date                                      |
| `poster_path`     | `string \| null`  | `null` → text fallback in the card           |
| `vote_average`    | `number`          | Not used for ranking                         |
| `vote_count`      | `number`          | **Primary ranking signal** (rating volume)   |
| `popularity`      | `number`          | Tie-breaker only (trending velocity)         |

### `PersonCrewCredit` (`types.ts:407`)

Same as cast, except it carries `job` (e.g. "Director") and `department` instead
of `character`. The card subtitle uses `job`.

Both arrive under `PersonDetailsResponse.person.combined_credits.{cast,crew}`
(`types.ts:434`).

## Derived output: Known For entry

A "Known For" entry is a credit selected from the merged cast+crew set. It is the
same union type already used by the page:

```
type KnownForCredit = PersonCastCredit | PersonCrewCredit;
```

No new type is strictly required; the helper returns `KnownForCredit[]`.

## Selection rules (the derivation)

Input: `cast: PersonCastCredit[]`, `crew: PersonCrewCredit[]`, `limit = 10`.

1. **Merge** cast and crew into one list.
2. **Exclude** non-narrative "Self" appearances — cast credits whose
   `character` is `"Self"`, `"Himself"`, `"Herself"`, `"Themselves"`, or begins
   with `"Self "` / `"Self-"` (talk-show/award-show guest & host spots). Crew
   credits (no `character`) are never excluded here.
3. **Sort** by `vote_count` descending, tie-broken by `popularity` descending.
   Rating volume approximates notability far better than raw `popularity`, which
   is a trending-velocity signal that lets daily talk shows dominate. (Stable
   enough for our purpose; remaining ties keep input order.)
4. **De-duplicate** by title key `` `${media_type}-${id}` `` — keep the first
   (highest-ranked) occurrence. Guarantees a title held in multiple roles
   appears once (FR-005, SC-002).
5. **Cap** to at most `limit` entries (default 10). Never pad (FR-004).
6. Result may be empty → the section is hidden (FR-008).

### Validation / invariants

- Output length ≤ `limit`.
- No two output entries share the same `` `${media_type}-${id}` `` key.
- Output contains no "Self" appearances.
- Output is ordered by descending `vote_count` (most notable first) — FR-003.
- Output ⊆ the person's existing credits (no fabricated titles).
- Each entry exposes a poster (or `null` for fallback), a display title
  (`title` ‖ `name` ‖ "Untitled"), and a year derived from
  `release_date`/`first_air_date` when present (FR-007).

## State transitions

None. The derivation is pure and recomputed (memoized) from the query result;
there is no mutable feature state, no user interaction that changes the set.
