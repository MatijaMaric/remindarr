# UI Contract: Known For section (Person detail page)

This feature exposes no new HTTP/API contract — it adds no endpoint and changes
no payload. The interface it introduces is a **UI contract**: the structure and
behavior of the "Known For" section on the person detail page. It consumes the
existing `GET /api/details/person/:personId` response unchanged.

## Placement

- Rendered inside `PersonPage`, **above** the "Acting" and "Crew" sections and
  below the Biography (i.e. near the top of the credit content). — FR-002
- The existing Acting and Crew sections remain present and unchanged. — FR-010

## Structure

When shown, the section consists of:

- A heading: **"Known For"**.
- A horizontally scrollable row (`ScrollableRow`) of credit cards, reusing the
  same `CreditCard` and `ScrollableRow` components and layout as the Acting/Crew
  rows. — FR-009

Each card:

- Links to the title detail page at `/title/{movie|tv}-{id}`. — FR-006
- Shows the poster (`poster_path` via `posterUrl`), or a readable text fallback
  (the title) when `poster_path` is null. — FR-007
- Shows the title (`title` ‖ `name` ‖ "Untitled"). — FR-007
- Shows the release year (first 4 chars of `release_date`/`first_air_date`) when
  a date exists; omits it otherwise. — FR-007, edge case "Missing release date"
- Shows a subtitle of the person's role on that title (`character` for an acting
  credit, `job` for a crew credit) where available. — FR-009 (parity with rows)

## Content rules

| Rule                                                                          | Requirement    |
| ----------------------------------------------------------------------------- | -------------- |
| Entries ranked by `popularity` descending (most notable first)                | FR-003         |
| At most 10 entries (default `KNOWN_FOR_LIMIT`)                                | FR-004, SC-002 |
| Fewer than 10 shown verbatim when the person has fewer credits (no padding)   | FR-004         |
| Each title appears at most once even across acting + crew roles               | FR-005, SC-002 |
| Section hidden entirely (no heading) when the person has no credits           | FR-008         |
| Behavior identical to Acting/Crew rows: card style, scroll, click-to-navigate | FR-009, SC-005 |

## Error / empty behavior

- Person data fails to load → existing not-found/error UI renders; no "Known For"
  section is shown (no change to current behavior). — edge case "Data unavailable"
- Person loads but has zero credits → section absent. — FR-008

## Non-goals

- No persistence, no per-user configuration, no settings. — spec Assumptions
- No change to the server, the person endpoint payload, or the database.
