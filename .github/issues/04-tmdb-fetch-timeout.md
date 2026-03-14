---
title: "Add timeout to TMDB API fetch calls"
labels: ["bug", "priority:high"]
---

## Problem

All `fetch()` calls to the TMDB API in `server/tmdb/client.ts` have no timeout configured. If TMDB becomes slow or unresponsive, the server will hang indefinitely waiting for responses, eventually exhausting available connections.

## Suggested Fix

Add `AbortController` with a reasonable timeout (10-15 seconds) to all TMDB fetch calls:

```typescript
async function tmdbFetch(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}
```

Consider making the timeout configurable via an environment variable.

## Files

- `server/tmdb/client.ts`
