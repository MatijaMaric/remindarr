---
title: "Replace array index keys with stable keys in TitleDetailPage"
labels: ["bug", "priority:low"]
---

## Problem

Several lists in `TitleDetailPage.tsx` use array index (`key={i}`) instead of stable keys:

- Line 283: Genre tags — `key={i}` should be `key={g}` (genre string is unique)
- Line 353: Release dates — `key={i}` should be `key={rd.release_date + rd.type}`
- Line 109: Provider rows — `key={i}` should be `key={p.provider_id}`

Using index keys can cause subtle re-render bugs when lists are reordered or filtered.

## Suggested Fix

Use data-derived keys:

```tsx
{genres.map((g) => <span key={g}>{g}</span>)}
{releaseDates.map((rd) => <div key={`${rd.release_date}-${rd.type}`}>...</div>)}
{providers.map((p) => <div key={p.provider_id}>...</div>)}
```

## Files

- `frontend/src/pages/TitleDetailPage.tsx`
