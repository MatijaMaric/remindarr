---
title: "Improve OIDC state store for reliability"
labels: ["enhancement", "priority:low"]
---

## Problem

OIDC state tokens are stored in an in-memory `Map` with a 10-minute TTL:

```typescript
// server/auth/oidc.ts:36-47
const stateStore = new Map<string, number>();
```

Two issues:
1. **Memory leak risk**: Cleanup only runs when a new state is generated. If no new OIDC logins happen for a while, expired states accumulate.
2. **Multi-instance incompatibility**: If the app is ever deployed behind a load balancer, state created on instance A won't be found on instance B.

## Suggested Fix

**Short term:** Move state to SQLite (already available):
```sql
CREATE TABLE oidc_states (state TEXT PRIMARY KEY, created_at INTEGER);
```

This solves both cleanup (SQL `DELETE WHERE created_at < ?`) and multi-instance (shared DB).

**Alternative:** Add periodic cleanup via the existing job queue system.

## Files

- `server/auth/oidc.ts`
