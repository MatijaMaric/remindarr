---
title: "Add rendering tests for frontend components"
labels: ["testing", "priority:medium"]
---

## Problem

18+ React components and pages have no rendering tests. Existing frontend tests only validate logic/types, not actual component behavior.

### Untested pages:
- `LoginPage.tsx` — authentication UI
- `ProfilePage.tsx` — user profile
- `TrackedPage.tsx` — watchlist
- `CalendarPage.tsx` — calendar view
- `TitleDetailPage.tsx` — title detail view
- `SeasonDetailPage.tsx` — season detail view
- `EpisodeDetailPage.tsx` — episode detail view

### Untested components:
- `TrackButton.tsx` — track/untrack button
- `SearchBar.tsx` — search input with IMDB detection
- `TitleCard.tsx` — title card display
- `TitleList.tsx` — title grid/list
- `FilterBar.tsx` — filter controls
- `MultiSelectDropdown.tsx` — multi-select UI
- `ReelsCard.tsx` — reels card

## Acceptance Criteria

Priority components to test first:
- [ ] `SearchBar` — test IMDB URL detection, search submission, debounce
- [ ] `TrackButton` — test track/untrack toggle, loading state, optimistic update
- [ ] `TitleCard` — test rendering with various title shapes (movie vs show, with/without poster)
- [ ] `FilterBar` — test filter selection, clear filters, hide tracked toggle

## Files

- `frontend/src/components/` and `frontend/src/pages/`
