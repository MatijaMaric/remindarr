---
title: "Add rate limiting to search and sync endpoints"
labels: ["enhancement", "security", "priority:low"]
---

## Problem

No rate limiting exists on any API endpoint. Endpoints like `/api/search` proxy to the TMDB API and could be abused to exhaust the API quota. `/api/sync` triggers expensive database operations.

## Suggested Fix

Add rate limiting middleware to sensitive endpoints. Hono has middleware options, or use a simple in-memory token bucket:

```typescript
import { rateLimiter } from "hono-rate-limiter";

app.use("/api/search/*", rateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  limit: 30,            // 30 requests per minute
  keyGenerator: (c) => c.req.header("x-forwarded-for") || "anonymous",
}));

app.use("/api/sync", rateLimiter({
  windowMs: 60 * 1000,
  limit: 5,
}));
```

## Files

- `server/index.ts`
