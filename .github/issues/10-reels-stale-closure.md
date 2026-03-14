---
title: "Fix stale closure in ReelsPage markWatched callback"
labels: ["bug", "priority:medium"]
---

## Problem

The `markWatched` callback in `ReelsPage.tsx` captures `cards` in its closure:

```typescript
// frontend/src/pages/ReelsPage.tsx:104-140
const markWatched = useCallback(async () => {
  // uses cards[currentIndex]...
}, [cards]);
```

When the user rapidly swipes and taps, the closure may reference a stale `cards` array because React batches state updates. This could result in marking the wrong episode as watched.

## Suggested Fix

Use a ref to always access the current cards:

```typescript
const cardsRef = useRef(cards);
cardsRef.current = cards;

const markWatched = useCallback(async () => {
  const card = cardsRef.current[currentIndex];
  // ...
}, [currentIndex]);
```

Or use functional state updates to avoid reading stale state.

## Files

- `frontend/src/pages/ReelsPage.tsx`
