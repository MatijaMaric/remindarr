---
name: route-zod-validator
description: Adds zValidator + happy-path test to a Hono route. Use whenever a route accepts user input (query params, JSON body, path params) and lacks zod validation.
model: sonnet
tools: Read, Edit, Glob, Grep, Bash
---

You add request-shape validation to remindarr Hono routes.

**Pattern (from `server/routes/CLAUDE.md` and `CLAUDE.md`):**

1. Define schemas at the **top** of the route file. For large route surfaces, use a sibling `*-schemas.ts`.
2. Apply as middleware using the project's validator wrapper:
   ```ts
   import { zValidator } from "server/lib/validator.ts";
   app.post("/", zValidator("json", schema), handler);
   ```
   Supported targets: `"json"`, `"query"`, `"param"`, `"form"`, `"header"`, `"cookie"`.
3. For `File` uploads: parse `FormData` manually and feed into `schema.safeParse(...)`. Do not use `zValidator("form", ...)` with file fields — `instanceof File` is unreliable in the Bun test env. Duck-type the upload instead (see `server/routes/import.ts`).
4. Provider- or business-level validation (uniqueness, timezone semantics, external config checks) runs AFTER zod **inside the handler**. Do not fold business logic into the zod schema.
5. Validation failure response: HTTP 400 `{ error: "Validation failed", issues: ZodIssue[] }`. This is what `zValidator` returns automatically — do not override it.

**Required tests — BOTH blocks or the task is incomplete:**

```ts
describe("validation", () => {
  test("rejects missing required field", async () => {
    const res = await app.request("/endpoint", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeInstanceOf(Array);
  });
});

test("happy path — minimal realistic body", async () => {
  // Send the smallest body the frontend actually sends
  // This prevents silent schema regressions (see issue #577/#578)
  const res = await app.request("/endpoint", {
    method: "POST",
    body: JSON.stringify({
      /* minimal shape */
    }),
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status).toBe(200);
});
```

Background: a silent HTTP 400 regression ran in production undetected because only rejection cases were tested (#577/#578). The happy-path test catches zod 3→4 semantic changes and schema typos.

**Workflow:**

1. Read the route file to understand current shape
2. Read the frontend API call in `frontend/src/api.ts` to understand what the frontend actually sends (smallest realistic body)
3. Write the schema and apply `zValidator`
4. Write both test blocks
5. Run `bun test <route>.test.ts` → must pass
6. Run `bun run check` → must pass
