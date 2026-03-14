---
title: "Show error state in CategoryBrowse when pagination fails"
labels: ["bug", "priority:medium"]
---

## Problem

In `CategoryBrowse.tsx`, the error state is set when `browseTitles()` fails, but it's never displayed to the user:

```typescript
// frontend/src/components/CategoryBrowse.tsx:101-143
} catch (err) {
  setError(err instanceof Error ? err.message : "Failed to load");
}
```

When infinite scroll pagination fails (e.g., network error), the user sees no indication — loading just silently stops.

## Suggested Fix

Display an error message with a retry button when the error state is set:

```tsx
{error && (
  <div className="text-center py-4 text-red-400">
    <p>{error}</p>
    <button onClick={() => loadMore()} className="mt-2 underline">
      Retry
    </button>
  </div>
)}
```

## Files

- `frontend/src/components/CategoryBrowse.tsx`
