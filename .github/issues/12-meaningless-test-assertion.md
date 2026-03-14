---
title: "Fix meaningless test assertion in repository tests"
labels: ["bug", "testing", "priority:medium"]
---

## Problem

There is a test that doesn't actually verify anything:

```typescript
// server/db/repository.test.ts:573
expect(true).toBe(true); // "Verify no duplicate by inserting again"
```

This test always passes regardless of whether the deduplication logic works.

## Suggested Fix

Replace with an actual assertion that queries the database and verifies no duplicates exist:

```typescript
const count = db.select({ count: sql`count(*)` }).from(offers)
  .where(eq(offers.titleId, titleId))
  .get();
expect(count.count).toBe(1); // Should not have duplicated the offer
```

## Files

- `server/db/repository.test.ts`
