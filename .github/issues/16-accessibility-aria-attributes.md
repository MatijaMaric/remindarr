---
title: "Add ARIA attributes to toggle buttons for accessibility"
labels: ["enhancement", "accessibility", "priority:low"]
---

## Problem

The "Hide Tracked" toggle button in `FilterBar.tsx` doesn't have proper ARIA attributes:

```typescript
// frontend/src/components/FilterBar.tsx:162-172
```

Screen reader users won't know the toggle state.

## Suggested Fix

Add `aria-pressed` to toggle buttons:

```tsx
<button
  aria-pressed={hideTracked}
  onClick={() => setHideTracked(!hideTracked)}
>
  Hide Tracked
</button>
```

Also audit other interactive elements for missing ARIA labels.

## Files

- `frontend/src/components/FilterBar.tsx`
