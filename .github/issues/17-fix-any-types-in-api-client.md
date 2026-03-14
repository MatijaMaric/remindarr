---
title: "Replace `any` return types in frontend API client"
labels: ["enhancement", "priority:low"]
---

## Problem

`getAdminSettings()` and `updateAdminSettings()` in `frontend/src/api.ts` return `any`:

```typescript
// frontend/src/api.ts:196, 200
```

This removes type safety for admin settings and allows runtime errors to slip through without compiler warnings.

## Suggested Fix

Define proper TypeScript interfaces for admin settings:

```typescript
interface AdminSettings {
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  // ... other fields
}

export async function getAdminSettings(): Promise<AdminSettings> { ... }
export async function updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> { ... }
```

## Files

- `frontend/src/api.ts`
- `frontend/src/types.ts` (for the interface definition)
