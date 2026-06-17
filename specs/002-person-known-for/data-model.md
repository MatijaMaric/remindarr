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
| `vote_count`      | `number`          | Not used for ranking                         |
| `popularity`      | `number`          | **Ranking signal**                           |

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
2. **Sort** by `popularity` descending. (Stable enough for our purpose; ties keep
   input order.)
3. **De-duplicate** by title key `` `${media_type}-${id}` `` — keep the first
   (highest-popularity) occurrence. Guarantees a title held in multiple roles
   appears once (FR-005, SC-002).
4. **Cap** to at most `limit` entries (default 10). Never pad (FR-004).
5. Result may be empty → the section is hidden (FR-008).

### Validation / invariants

- Output length ≤ `limit`.
- No two output entries share the same `` `${media_type}-${id}` `` key.
- Output is ordered by descending `popularity` (most notable first) — FR-003.
- Output ⊆ the person's existing credits (no fabricated titles).
- Each entry exposes a poster (or `null` for fallback), a display title
  (`title` ‖ `name` ‖ "Untitled"), and a year derived from
  `release_date`/`first_air_date` when present (FR-007).

## State transitions

None. The derivation is pure and recomputed (memoized) from the query result;
there is no mutable feature state, no user interaction that changes the set.
