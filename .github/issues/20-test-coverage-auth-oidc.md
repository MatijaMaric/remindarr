---
title: "Add test coverage for auth middleware and OIDC flow"
labels: ["testing", "priority:high"]
---

## Problem

The authentication system has minimal test coverage:

- `server/auth/oidc.ts` — zero tests (state generation, token exchange, userinfo fetch)
- `server/middleware/auth.ts` — zero tests (session validation, `requireAuth`, `optionalAuth`)
- `server/routes/auth.ts` — partially tested (login/logout may be covered, but OIDC callback, password change, and user creation are not)

Authentication is security-critical and must be thoroughly tested.

## Acceptance Criteria

- [ ] OIDC state generation and validation
- [ ] OIDC callback with valid/invalid/expired state
- [ ] Token exchange success and failure
- [ ] User creation from OIDC userinfo
- [ ] `requireAuth` middleware blocks unauthenticated requests
- [ ] `optionalAuth` middleware allows unauthenticated requests but populates user when present
- [ ] Session expiration handling
- [ ] Password change with correct/incorrect current password

## Files

- `server/auth/oidc.ts` → `server/auth/oidc.test.ts`
- `server/middleware/auth.ts` → `server/middleware/auth.test.ts`
- `server/routes/auth.ts` → `server/routes/auth.test.ts`
