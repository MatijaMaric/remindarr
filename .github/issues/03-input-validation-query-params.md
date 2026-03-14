---
title: "Add input validation for numeric query parameters"
labels: ["bug", "security", "priority:high"]
---

## Problem

Multiple routes parse numeric query parameters without bounds checking. Negative values, NaN, or extremely large numbers pass through directly to database queries.

Affected routes:
- `server/routes/titles.ts:9-16` — `daysBack`, `limit`, `offset`
- `server/routes/browse.ts:99` — `page`
- `server/routes/calendar.ts` — `objectType`, `provider` (no type validation)

Example:
```typescript
const daysBack = Number(c.req.query("daysBack")) || 30;
const limit = Number(c.req.query("limit")) || 100;
```

A request like `?limit=999999999&offset=-1` would be accepted.

## Suggested Fix

Clamp values to valid ranges:

```typescript
const daysBack = Math.max(1, Math.min(Number(c.req.query("daysBack")) || 30, 365));
const limit = Math.max(1, Math.min(Number(c.req.query("limit")) || 100, 1000));
const offset = Math.max(0, Number(c.req.query("offset")) || 0);
const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
```

Validate enum params like `objectType`:
```typescript
if (objectType && !["MOVIE", "SHOW"].includes(objectType)) {
  return c.json({ error: "Invalid type" }, 400);
}
```

## Files

- `server/routes/titles.ts`
- `server/routes/browse.ts`
- `server/routes/calendar.ts`
