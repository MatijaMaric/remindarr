# Quickstart: Known For on Person Detail Page

A validation/run guide proving the feature works end-to-end. For the data shape
see [data-model.md](./data-model.md); for the UI contract see
[contracts/known-for-ui.md](./contracts/known-for-ui.md).

## Prerequisites

- Dependencies installed: `bun install` (root) and `cd frontend && bun install`.
- A TMDB API key configured (`TMDB_API_KEY`) for the live walkthrough. The unit
  tests need no key — they exercise the pure selection helper with fixtures.

## Run the app

```bash
bun run dev          # server (:3000) + frontend (:5173) concurrently
```

Then open a well-known person's detail page, e.g. a prolific actor/director:

```
http://localhost:5173/person/287      # (example TMDB person id)
```

## Manual validation scenarios

1. **Section appears at the top (SC-001, FR-002)**
   - A "Known For" row is visible above "Acting" and "Crew", without scrolling.

2. **Ranked, capped, de-duplicated (FR-003, FR-004, FR-005, SC-002)**
   - At most 10 cards; ordered most-notable-first.
   - A title the person both acted in and directed appears only once.

3. **Card content + navigation (FR-006, FR-007)**
   - Each card shows poster (or text fallback), title, and year when available.
   - Clicking a card navigates to that title's detail page.

4. **Parity with existing rows (FR-009, SC-005)**
   - Card style, horizontal scrolling, and click behavior match the Acting/Crew
     rows. Acting and Crew sections are still present and unchanged.

5. **Empty / edge cases (FR-008)**
   - A person with no credits: no "Known For" heading or row is rendered.
   - A person with one or two credits: only those titles show (no padding).
   - A title with no poster: text fallback. A title with no date: year omitted.

6. **Data unavailable**
   - With person data failing to load, the existing "Person not found" state
     renders and no broken "Known For" section appears.

## Automated checks

```bash
# Unit tests for the selection helper (ranking, cross-role dedupe, cap, empty)
bun test frontend/src/pages/PersonPage.test.ts

# Full pre-PR gate (type checks + lint + all tests + build + wrangler dry-run)
bun run check
```

Expected: the new `selectKnownFor` tests pass; ESLint reports zero errors and
zero warnings; the existing Acting/Crew behavior shows no regression.
