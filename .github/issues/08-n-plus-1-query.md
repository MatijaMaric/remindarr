---
title: "Optimize N+1 query in getRecentTitles"
labels: ["enhancement", "performance", "priority:medium"]
---

## Problem

`getRecentTitles()` calls `getOffersForTitle()` for each row, producing N+1 database queries:

```typescript
// server/db/repository.ts:287-293
return rows.map((row) => ({
  ...row,
  offers: getOffersForTitle(row.id),  // 1 query per title
}));
```

For a page of 100 titles, this executes 101 queries (1 for titles + 100 for offers).

## Suggested Fix

Batch-fetch all offers in a single query using `WHERE title_id IN (...)` and group in memory:

```typescript
const titleIds = rows.map(r => r.id);
const allOffers = db.select().from(offers).where(inArray(offers.titleId, titleIds)).all();
const offersByTitle = Map.groupBy(allOffers, o => o.titleId);

return rows.map((row) => ({
  ...row,
  offers: offersByTitle.get(row.id) ?? [],
}));
```

## Files

- `server/db/repository.ts`
