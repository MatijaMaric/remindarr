# Notifications guidance

## Provider registry

`server/notifications/registry.ts` — register new providers here.

Current providers: Discord, Telegram, Gotify, Ntfy, Webhook, Web Push.

## Implementing a new provider

Read these files first (in order):

1. `server/notifications/types.ts` — `NotificationProvider` interface
2. `server/notifications/discord.ts` — reference implementation
3. `server/notifications/content.ts` — content builder (titles, episodes, streaming alerts)
4. `server/routes/notifiers.ts` — zod schema for the notifier config shape

## Non-negotiable guard clause

**Always check `streamingAlerts.length > 0` before rendering streaming-alert content.** A provider that renders an empty streaming-alerts block when `length === 0` is a bug that shipped in the past and must not recur.

```ts
if (content.streamingAlerts.length > 0) {
  // render streaming alert section
}
```

## `validateConfig`

Belongs in the provider, not in the zod schema. Runs AFTER shape validation, inside the route handler, for business-rule failures (bad URL, missing token, unreachable endpoint). Zod only validates shape/types.

## Test requirements

Every provider must have a colocated `*.test.ts` covering all four cases:

1. Title notification (movie or show)
2. Episode notification
3. Streaming alert with `streamingAlerts.length > 0`
4. Streaming alert with `streamingAlerts.length === 0` — assert nothing streaming-alert-specific renders
5. `validateConfig` failure case

Mock all outbound HTTP — never make real network calls in tests. Use `mock.module` or `spyOn` on the fetch boundary. Always restore mocks in `afterEach` (Bun leaks `spyOn` between test files on Linux CI if not restored — see project memory `feedback_bun_spy_restore`).
