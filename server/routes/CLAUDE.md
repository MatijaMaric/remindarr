# Routes guidance

One file per domain, each with a colocated `*.test.ts`.

## Route validation

Use zod + `zValidator` from `server/lib/validator.ts` for request shape validation at the route boundary.

```ts
import { zValidator } from "server/lib/validator.ts";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1) });

app.post("/", zValidator("json", schema), (c) => {
  const { name } = c.req.valid("json");
  // ...
});
```

- Supported targets: `"json"`, `"query"`, `"param"`, `"form"`, `"header"`, `"cookie"`
- For multipart `File` uploads: parse `FormData` manually and feed into `schema.safeParse(...)` (see `server/routes/import.ts`) — `instanceof File` is unreliable in the Bun test env, duck-type the upload instead
- Validation failures return HTTP 400 with `{ error: "Validation failed", issues: ZodIssue[] }` automatically
- Provider- or business-level validation (notifier `validateConfig`, timezone semantics, uniqueness) runs AFTER zod **inside the handler**. Zod only validates shape/types.

### Required tests — both blocks or the task is incomplete

```ts
describe("validation", () => {
  test("rejects missing required field", async () => {
    const res = await app.request("/endpoint", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeInstanceOf(Array);
  });
});

test("happy path — minimal realistic body", async () => {
  // Background: #577/#578 — silent HTTP 400 ran in prod undetected because
  // only rejection cases were tested. This catches zod 3→4 semantic changes.
  const res = await app.request("/endpoint", {
    method: "POST",
    body: JSON.stringify({
      /* smallest body frontend actually sends */
    }),
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status).toBe(200);
});
```

## Route files

| File                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `titles.ts`              | Title listing with filters (daysBack, objectType, provider, genre, language) |
| `search.ts`              | TMDB search (rate-limited 30/min)                                            |
| `browse.ts`              | Category browsing (popular, upcoming, top_rated)                             |
| `calendar.ts`            | Monthly calendar view                                                        |
| `details.ts`             | Movie/show/season/episode/person details                                     |
| `track.ts`               | Watchlist add/remove (requires auth)                                         |
| `episodes.ts`            | Upcoming episodes, episode sync trigger                                      |
| `watched.ts`             | Episode watched status (single + bulk)                                       |
| `sync.ts`                | Manual sync trigger (admin only, rate-limited 5/min)                         |
| `imdb.ts`                | IMDB URL resolution                                                          |
| `auth-custom.ts`         | Custom auth endpoints; better-auth handles `/api/auth/*`                     |
| `admin.ts`               | OIDC settings + user management (admin only)                                 |
| `notifiers.ts`           | Notification channel CRUD + test                                             |
| `integrations.ts`        | External integration CRUD (Plex, etc.)                                       |
| `import.ts`              | Watchlist CSV import                                                         |
| `profile.ts`             | User profile (public view)                                                   |
| `social.ts`              | Follow/unfollow, follower/following lists                                    |
| `ratings.ts`             | Title and episode ratings (HATE/DISLIKE/LIKE/LOVE)                           |
| `recommendations.ts`     | Recommendation broadcast to followers (1-to-N, not 1-to-1)                   |
| `invitations.ts`         | Signup invite codes                                                          |
| `feed.ts`                | Public `.ics` calendar feed (token-authenticated) + token management         |
| `stats.ts`               | User statistics                                                              |
| `user-settings.ts`       | Per-user settings (homepage layout, etc.)                                    |
| `jobs.ts` / `jobs-cf.ts` | Job stats + manual trigger (Bun / CF variants)                               |
| `metrics.ts`             | Prometheus metrics                                                           |
| `health.ts`              | Health check                                                                 |

## API Routes catalog

All routes are under `/api` except `/metrics`.

### Public (no auth)

- `GET /api/health`
- `GET /metrics` (optionally bearer-guarded via `METRICS_TOKEN`)
- `POST|GET /api/auth/*` — better-auth handler
- `GET /api/auth/custom/providers`
- `GET /api/feed/calendar.ics?token=<user-feed-token>`

### Optional auth (`is_tracked` depends on session)

- `GET /api/titles`, `GET /api/titles/{providers,genres,languages}`
- `GET /api/search?q=` (rate-limited: 30/min)
- `GET /api/browse`
- `GET /api/calendar`
- `GET /api/user/:username`
- `GET /api/social/{followers,following}/:id`
- `GET /api/ratings/*`
- `GET /api/details/{movie,show,person}/...`
- `GET /api/episodes/upcoming`

### Requires auth

- `GET/POST/DELETE /api/track/:id`
- `POST/DELETE /api/watched/:episodeId`, `POST /api/watched/bulk`
- `POST /api/imdb`
- `GET/POST/PUT/DELETE /api/notifiers` + `POST /api/notifiers/:id/test`
- `GET/POST/PUT/DELETE /api/integrations`
- `POST /api/import`
- `GET /api/stats`
- `GET/PUT /api/user/settings`
- `POST/DELETE /api/social/follow`
- `POST/DELETE /api/ratings`
- `GET/POST /api/recommendations`
- `GET/POST/DELETE /api/invitations`
- `GET/POST/DELETE /api/feed/token`
- `POST /api/episodes/sync`

### Admin only

- `GET/PUT /api/admin/settings`
- `GET/PATCH /api/admin/users`
- `GET /api/jobs`, `POST /api/jobs/:name`
- `POST /api/sync` (rate-limited: 5/min)
