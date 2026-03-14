---
title: "Add try-catch around JSON.parse for notifier configs"
labels: ["bug", "priority:high"]
---

## Problem

Notifier config rows are parsed with `JSON.parse(row.config)` in multiple places without error handling. If stored data is corrupted, this will throw an unhandled exception and crash the request.

Affected locations:
- `server/db/repository.ts:1201`
- `server/db/repository.ts:1231`
- `server/db/repository.ts:1269`

## Suggested Fix

Wrap in try-catch and return a safe default or skip the notifier:

```typescript
let config: Record<string, unknown>;
try {
  config = JSON.parse(row.config);
} catch {
  log.warn("Failed to parse notifier config", { id: row.id });
  config = {};
}
```

## Files

- `server/db/repository.ts`
