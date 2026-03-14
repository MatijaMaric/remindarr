---
title: "Return 400 for malformed JSON in sync route instead of silently accepting"
labels: ["bug", "priority:high"]
---

## Problem

The sync route silently swallows malformed JSON request bodies:

```typescript
// server/routes/sync.ts:8
const body = await c.req.json().catch(() => ({}));
```

If a client sends invalid JSON, the request proceeds with an empty config object instead of reporting the error, making debugging difficult.

## Suggested Fix

```typescript
let body: Record<string, unknown>;
try {
  body = await c.req.json();
} catch {
  return c.json({ error: "Invalid JSON in request body" }, 400);
}
```

## Files

- `server/routes/sync.ts`
