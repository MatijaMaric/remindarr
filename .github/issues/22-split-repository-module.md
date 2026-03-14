---
title: "Split repository.ts into domain-specific modules"
labels: ["enhancement", "refactoring", "priority:medium"]
---

## Problem

`server/db/repository.ts` is 1,797 lines long and contains all database operations for every domain: titles, episodes, offers, providers, users, sessions, tracked items, notifiers, scores, and admin settings.

This makes the file difficult to navigate, review, and test. It also increases the risk of merge conflicts when multiple features touch different domains.

## Suggested Structure

```
server/db/
├── repository/
│   ├── index.ts          # Re-exports all functions (backward-compatible)
│   ├── titles.ts         # Title CRUD, search, filtering
│   ├── episodes.ts       # Episode CRUD, watch state
│   ├── offers.ts         # Offer upsert, deduplication
│   ├── users.ts          # User CRUD, auth, sessions
│   ├── tracked.ts        # Track/untrack, watchlist queries
│   ├── notifiers.ts      # Notifier CRUD, config management
│   └── scores.ts         # Score/rating operations
├── schema.ts             # (unchanged)
└── repository.ts         # (deprecated, re-exports from repository/)
```

The `index.ts` re-export ensures all existing imports continue to work.

## Files

- `server/db/repository.ts`
