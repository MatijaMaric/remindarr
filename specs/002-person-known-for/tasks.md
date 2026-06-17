---
description: "Task list for Known For on Person Detail Page"
---

# Tasks: Known For on Person Detail Page

**Input**: Design documents from `/specs/002-person-known-for/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/known-for-ui.md ✅, quickstart.md ✅

**Tests**: INCLUDED. Constitution Principle I (Test-Driven Quality, NON-NEGOTIABLE) and the plan require a colocated `bun:test` unit test for the pure selection helper. Tests are written before/with the implementation they cover.

**Organization**: Tasks are grouped by user story. This is a presentation-only frontend change confined to `frontend/src/pages/PersonPage.tsx` and its colocated test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Exact file paths are included in each task

## Path Conventions

Web application; this feature touches only `frontend/`. The only source file modified is `frontend/src/pages/PersonPage.tsx`; the only test file is `frontend/src/pages/PersonPage.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the workspace is ready. No new dependencies, no scaffolding — the data and components already exist.

- [x] T001 Confirm working on branch `002-person-known-for` and that frontend deps are installed (`bun install` at root and in `frontend/`); confirm `frontend/src/pages/PersonPage.tsx` and `frontend/src/pages/PersonPage.test.ts` exist and that `bun test frontend/src/pages/PersonPage.test.ts` runs green before changes.

**Checkpoint**: Build/test baseline is green; ready for foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure selection logic (`selectKnownFor` + `KNOWN_FOR_LIMIT`) that the Known For section is built on. This is shared by both user stories and MUST exist before any rendering work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Write failing `bun:test` unit tests for `selectKnownFor` in `frontend/src/pages/PersonPage.test.ts` covering, with `PersonCastCredit`/`PersonCrewCredit` fixtures: (a) ranking by `popularity` descending, (b) cross-role de-duplication by `${media_type}-${id}` keeping the highest-popularity occurrence, (c) cap at `KNOWN_FOR_LIMIT` (10), (d) fewer-than-limit returned verbatim with no padding, (e) empty input → empty array, (f) a movie and a TV title sharing the same numeric `id` are NOT collapsed. Tests must FAIL (helper not yet implemented/exported).
- [x] T003 Implement and export the pure helper `selectKnownFor(credits, limit = KNOWN_FOR_LIMIT)` and the named constant `KNOWN_FOR_LIMIT = 10` in `frontend/src/pages/PersonPage.tsx`: merge cast + crew, sort by `popularity` descending, de-duplicate by `${media_type}-${id}` (reuse the `creditTitleId` key shape), slice to `limit`; typed against the existing `PersonCastCredit | PersonCrewCredit` union (no `any`). Make the T002 tests pass.

**Checkpoint**: `selectKnownFor` is implemented, exported, and unit-tested green. Rendering can now begin.

---

## Phase 3: User Story 1 - See a person's most notable work at a glance (Priority: P1) 🎯 MVP

**Goal**: A "Known For" section appears near the top of the person detail page (above Acting/Crew), showing the person's most notable titles in descending notability order, each card linking to the title and showing poster (or fallback), title, and year when available.

**Independent Test**: Open a well-known person's detail page (e.g. `/person/287`) and confirm a "Known For" row appears above the Acting and Crew lists with an ordered, deduplicated, capped (≤10) set of titles; clicking a card opens that title's detail page; cards show poster/fallback, title, and year when present.

### Implementation for User Story 1

- [x] T004 [US1] In `frontend/src/pages/PersonPage.tsx`, derive the Known For list with `useMemo` from `person.combined_credits.cast`/`crew` via `selectKnownFor(...)`, recomputed only when the credits change (read from the existing `["person", personId]` query — no new fetch).
- [x] T005 [US1] In `frontend/src/pages/PersonPage.tsx`, render the "Known For" `<section>` with an `<h2>Known For</h2>` heading and a `ScrollableRow` of `CreditCard`s, placed **above** the Acting section and below the Biography (per contracts/known-for-ui.md placement); compute each card's `subtitle` from the credit's role — `character` for an acting credit, `job` for a crew credit — without using `any` (narrow on the union); use a stable React `key` based on the `${media_type}-${id}` title key.
- [x] T006 [US1] In `frontend/src/pages/PersonPage.tsx`, guard the section so it renders nothing (no heading, no row) when `selectKnownFor(...)` returns an empty array (FR-008), mirroring the existing `castCredits.length > 0` / `crewCredits.length > 0` guards; verify the existing "Person not found"/error path (`error || !data`) is untouched so no broken section renders when data fails to load.

**Checkpoint**: User Story 1 is fully functional — the MVP. A person with credits shows a ranked, deduplicated, capped Known For row above Acting/Crew; a person with none shows no section.

---

## Phase 4: User Story 2 - Navigate consistently from Known For (Priority: P2)

**Goal**: The Known For section looks and behaves exactly like the existing Acting/Crew rows — same card style, same horizontal scrolling, same click-to-navigate — by reusing the shared `CreditCard` and `ScrollableRow`, with no regression to the existing sections.

**Independent Test**: On the same page, compare the Known For row with the Acting/Crew rows: cards, horizontal scroll, and click-to-navigate behave identically; Acting and Crew sections remain present and unchanged.

### Tests for User Story 2

- [x] T007 [P] [US2] Add a component-level test in `frontend/src/pages/PersonPage.test.ts` (using `@testing-library/react` + happy-dom, wrapping in a fresh `new QueryClient({ defaultOptions: { queries: { retry: false } } })` provider per frontend test convention) that renders `PersonPage` with a mocked person payload and asserts: the "Known For" heading appears above the "Acting" heading in DOM order; Known For cards link to `/title/${media_type}-${id}`; and the Acting and Crew sections are still rendered (no regression, SC-005). Mock `api.getPersonDetails` — no real HTTP.

### Implementation for User Story 2

- [x] T008 [US2] In `frontend/src/pages/PersonPage.tsx`, confirm the Known For section reuses the exact `CreditCard` (poster `w342` + text fallback, year omitted when no date) and `ScrollableRow` (`className="gap-4 pb-2"`) markup used by Acting/Crew so card style, horizontal scroll, and navigation match (FR-009); make the T007 parity test pass and ensure the existing Acting/Crew rendering is unchanged (FR-010).

**Checkpoint**: Both stories work; Known For is visually and behaviorally indistinguishable from the existing rows, and the existing rows are unregressed.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and gate.

- [x] T009 Run the quickstart.md manual validation scenarios against a live person page (`bun run dev`, open a prolific person): section placement/visibility (SC-001), ranked/capped/deduped (SC-002), card content + navigation (SC-003), parity (SC-005), and edge cases (no credits, few credits, missing poster, missing date).
- [x] T010 Run `bun run check` from repo root (server tsc + frontend tsc + ESLint zero-warnings + all tests + frontend build + wrangler dry-run) and confirm it passes before opening the PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS both user stories** (the rendering imports the helper).
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP on its own.
- **User Story 2 (Phase 4)**: Depends on Foundational; in practice builds on the US1 section (parity/regression checks over the rendered section). US2's parity is largely satisfied by US1's component reuse, then verified here.
- **Polish (Phase 5)**: Depends on all desired stories being complete.

### Within Each Story

- T002 (failing tests) → T003 (implementation) — TDD order in Foundational.
- T004 (derive) → T005 (render) → T006 (empty guard) within US1.
- T007 (parity test) and T008 (confirm reuse) within US2; T008 makes T007 pass.

### Parallel Opportunities

- T002 (test file) can be authored in parallel with reading the source — marked [P] as it lives in a different file from the helper it tests, though T003 depends on it for TDD.
- T007 [P] (test additions in `PersonPage.test.ts`) is independent of the source edits in `PersonPage.tsx`.
- Note: T004–T006 and T008 all edit the **same file** (`PersonPage.tsx`) and therefore are **NOT** parallel with each other — sequence them.

---

## Parallel Example: Foundational + US2 tests

```bash
# Foundational TDD — write the failing helper tests first:
Task: "Write failing selectKnownFor unit tests in frontend/src/pages/PersonPage.test.ts" (T002)

# US2 parity test lives in the same test file but is independent of PersonPage.tsx edits:
Task: "Add Known For render/parity test in frontend/src/pages/PersonPage.test.ts" (T007)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup — confirm baseline green.
2. Phase 2: Foundational — `selectKnownFor` + `KNOWN_FOR_LIMIT`, unit-tested (CRITICAL, blocks all stories).
3. Phase 3: User Story 1 — derive + render + empty guard.
4. **STOP and VALIDATE**: Known For appears, ranked/capped/deduped, above Acting/Crew; navigates correctly.
5. Ship as MVP.

### Incremental Delivery

1. Setup + Foundational → helper ready and tested.
2. US1 → MVP: the Known For section works end-to-end.
3. US2 → parity verified + regression test for Acting/Crew.
4. Polish → quickstart walkthrough + `bun run check`.

---

## Notes

- Entire feature is confined to `frontend/src/pages/PersonPage.tsx` (+ colocated `PersonPage.test.ts`). No server, route, schema, or dependency change.
- `[P]` tasks = different files, no blocking dependency. Source-file tasks on `PersonPage.tsx` are intentionally serial.
- No `any` types; frontend must pass ESLint with zero warnings (CI fails on warnings).
- External APIs are mocked in tests — never make real HTTP calls.
- Commit after each task or logical group.
