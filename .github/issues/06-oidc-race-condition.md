---
title: "Fix OIDC user creation race condition"
labels: ["bug", "priority:high"]
---

## Problem

There is a time-of-check-time-of-use (TOCTOU) race condition in the OIDC callback handler:

```typescript
// server/routes/auth.ts:184-190
let user = getUserByProviderSubject("oidc", userInfo.sub);
if (!user) {
  let username = userInfo.username;
  if (getUserByUsername(username)) {
    username = `${username}_oidc`;
  }
  const id = createUser(username, null, ...);
  user = getUserByProviderSubject("oidc", userInfo.sub);
}
```

If two concurrent OIDC logins arrive for the same user, both threads pass the `getUserByProviderSubject` check, and the second `createUser` call hits the UNIQUE constraint, returning an unhandled database error to the user.

## Suggested Fix

Wrap user creation in a try-catch and handle the unique constraint violation gracefully:

```typescript
try {
  createUser(username, null, ...);
} catch (err) {
  // Retry lookup — another request likely created the user
  user = getUserByProviderSubject("oidc", userInfo.sub);
  if (!user) throw err; // Re-throw if it's a different error
}
```

Or use a database transaction with `INSERT OR IGNORE`.

## Files

- `server/routes/auth.ts`
