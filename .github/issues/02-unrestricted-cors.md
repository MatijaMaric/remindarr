---
title: "Security: Restrict CORS origins"
labels: ["bug", "security", "priority:critical"]
---

## Problem

CORS is configured with no origin restriction:

```typescript
// server/index.ts:58
app.use("/api/*", cors());
```

This allows any website to make cross-origin requests to the API. Combined with cookie-based auth, this could enable CSRF-like attacks from malicious sites.

## Suggested Fix

Restrict CORS to the app's own origin:

```typescript
app.use("/api/*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
```

Or in production, derive the origin from the request's `Host` header or a config value.

## Files

- `server/index.ts:58`
