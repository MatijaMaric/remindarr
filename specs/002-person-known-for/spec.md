# Feature Specification: Known For on Person Detail Page

**Feature Branch**: `002-person-known-for`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Add \"Known For\" to person detail page"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See a person's most notable work at a glance (Priority: P1)

A user opens a person's detail page (an actor, director, or other crew member) and immediately sees a "Known For" section near the top that highlights the handful of titles that person is most recognized for, so they can quickly understand who the person is without scrolling through their entire filmography.

**Why this priority**: This is the core of the feature. A person's full filmography can run to dozens or hundreds of credits; a curated "Known For" row is the fastest way for a user to recognize and contextualize a person. Delivering only this story already provides the complete user value.

**Independent Test**: Open the detail page for a well-known person with many credits and confirm a "Known For" section appears above the full credit lists, showing a small, ordered set of their most notable titles.

**Acceptance Scenarios**:

1. **Given** a person with many acting and/or crew credits, **When** the user opens their detail page, **Then** a "Known For" section is shown near the top of the page (above the full Acting and Crew lists) containing that person's most notable titles in descending order of notability.
2. **Given** a "Known For" title is displayed, **When** the user selects it, **Then** they are taken to that title's detail page.
3. **Given** a "Known For" title is displayed, **When** the user views the card, **Then** it shows the title's poster (or a graceful fallback), the title name, and the release year when available.

---

### User Story 2 - Navigate consistently from Known For (Priority: P2)

A user browsing the "Known For" section experiences the same look, navigation, and interaction as the existing Acting and Crew credit rows, so the page feels cohesive and the new section is not visually or behaviorally surprising.

**Why this priority**: Consistency reduces confusion and reuses established patterns, but the feature still delivers value (story 1) without perfect visual parity.

**Independent Test**: Compare the "Known For" row with the existing Acting/Crew rows on the same page and confirm cards, scrolling, and navigation behave identically.

**Acceptance Scenarios**:

1. **Given** the "Known For" section and the Acting/Crew sections are both present, **When** the user interacts with each, **Then** card layout, horizontal scrolling, and tap/click-to-navigate behave the same way across all sections.
2. **Given** a person has more notable titles than fit on screen, **When** the user scrolls the "Known For" row horizontally, **Then** additional titles are revealed up to the section's display limit.

---

### Edge Cases

- **Person with no credits**: When a person has no acting or crew credits, the "Known For" section is hidden entirely (no empty header).
- **Person with very few credits**: When a person has only one or two credits, "Known For" shows just those titles rather than padding to a fixed count.
- **Duplicate titles across roles**: When the same title appears in both acting and crew credits (or multiple times), it appears at most once in "Known For".
- **Missing poster art**: When a notable title has no poster image, the card falls back to a readable text placeholder, matching existing credit cards.
- **Missing release date**: When a title has no release/air date, the year is simply omitted from the card.
- **Data unavailable**: When the person's credit data cannot be loaded, the page behaves as it does today (existing not-found / error handling) and no broken "Known For" section is rendered.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The person detail page MUST display a "Known For" section that highlights the person's most notable titles.
- **FR-002**: The "Known For" section MUST appear near the top of the credit content, above the full Acting and Crew credit lists.
- **FR-003**: The system MUST select the "Known For" titles by ranking the person's combined acting and crew credits by notability (most-recognized first) and taking the top set.
- **FR-004**: The "Known For" set MUST be limited to a small, fixed maximum number of titles (default: 10) and MUST show fewer when the person has fewer credits.
- **FR-005**: The system MUST de-duplicate titles so a given title appears at most once in the "Known For" section, even if the person held multiple roles on it.
- **FR-006**: Each "Known For" entry MUST link to that title's detail page.
- **FR-007**: Each "Known For" entry MUST display the title's poster (with a text fallback when no poster exists), the title name, and the release year when a date is available.
- **FR-008**: The "Known For" section MUST be hidden entirely when the person has no credits.
- **FR-009**: The "Known For" section MUST visually and behaviorally match the existing credit rows on the page (card style, horizontal scrolling, navigation).
- **FR-010**: The feature MUST NOT change or remove the existing full Acting and Crew credit sections.

### Key Entities _(include if data involved)_

- **Person**: The actor/crew member whose detail page is being viewed; has a name, optional profile image, and a set of credits.
- **Credit**: A single appearance of the person on a title, carrying the title's identity, media type (movie/TV), poster, release/air date, and a notability/popularity signal used for ranking.
- **Known For Title**: A de-duplicated, top-ranked subset of the person's credits chosen to represent what the person is best known for.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For any person with at least one credit, opening their detail page surfaces a "Known For" section without the user scrolling.
- **SC-002**: The "Known For" section displays no more than 10 titles and never shows the same title twice.
- **SC-003**: Selecting any "Known For" title navigates the user to the correct title detail page in a single action, with the same success rate as the existing credit rows.
- **SC-004**: A user can identify a well-known person's most notable works within 5 seconds of the page loading, without scrolling or expanding any sections.
- **SC-005**: The change introduces no regression to the existing Acting and Crew sections (both remain present and functional).

## Assumptions

- "Most notable" is determined by the same popularity/notability signal already used to order the existing Acting and Crew credit rows; no new external data source is required.
- The default maximum of 10 "Known For" titles is a reasonable, adjustable default; the exact number is not business-critical.
- "Known For" is derived from the person's existing credit data already available to the detail page; no additional data collection from users is needed.
- The feature is presentation-only for end users (read-only browsing); no permissions, settings, or per-user configuration are involved.
- Visual styling reuses the existing credit-card and horizontal-scroll-row patterns already on the person page.
