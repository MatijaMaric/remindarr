---
title: "Add error handling for Promise.all in NewReleases filter loading"
labels: ["bug", "priority:medium"]
---

## Problem

`NewReleases.tsx` loads genres, providers, and languages via `Promise.all` with no error handling:

```typescript
// frontend/src/components/NewReleases.tsx:47-55
Promise.all([getGenres(), getProviders(), getLanguages()])
```

If any of these API calls fail, the entire Promise rejects and filter dropdowns silently don't populate, with no error feedback to the user.

## Suggested Fix

Use `Promise.allSettled()` so partial failures don't prevent other filters from loading:

```typescript
const [genresResult, providersResult, languagesResult] =
  await Promise.allSettled([getGenres(), getProviders(), getLanguages()]);

if (genresResult.status === "fulfilled") setGenres(genresResult.value);
if (providersResult.status === "fulfilled") setProviders(providersResult.value);
if (languagesResult.status === "fulfilled") setLanguages(languagesResult.value);
```

Or at minimum, add a `.catch()` handler that logs the error.

## Files

- `frontend/src/components/NewReleases.tsx`
