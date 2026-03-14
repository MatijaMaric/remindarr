---
title: "Security: Remove admin password from log output"
labels: ["bug", "security", "priority:critical"]
---

## Problem

When the server starts for the first time and creates the admin account, the auto-generated password is logged in plaintext via the structured logger:

```typescript
// server/index.ts:42
logger.info("Admin account created", { username: "admin", password });
```

If logs are shipped to any external service (Sentry, log aggregator, stdout in a container orchestrator), this is a credentials leak.

## Suggested Fix

Remove `password` from the log output. Either:
1. Print the password to stdout once outside the structured logger
2. Require the admin to set their password via environment variable (`ADMIN_PASSWORD`)
3. Log only that the account was created, and provide a CLI command to reset the password

## Files

- `server/index.ts:42`
