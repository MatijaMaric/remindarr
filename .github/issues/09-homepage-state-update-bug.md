---
title: "Fix potential state update bug in HomePage episode toggle"
labels: ["bug", "priority:medium"]
---

## Problem

In `HomePage.tsx`, the episode watch/unwatch toggle uses `setToday(updateAll)` and `setUpcoming(updateAll)`:

```typescript
// frontend/src/pages/HomePage.tsx:522-524
setToday(updateAll);
setUpcoming(updateAll);
```

If `updateAll` is not designed as a React functional updater (a function that takes the previous state and returns new state), this will replace the state with the function reference itself instead of updating episode data.

## Investigation Needed

Verify whether `updateAll` has the signature `(prev: T[]) => T[]`. If it does, this works correctly. If it's a pre-computed array, it should be passed as-is. If it's a function that takes different arguments, it needs to be wrapped: `setToday(prev => updateAll(prev))`.

## Files

- `frontend/src/pages/HomePage.tsx`
