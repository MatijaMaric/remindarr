# Browser account isolation

Every authenticated identity receives its own React Query client and account-scoped
query hashes. Logout, login, signup, expired sessions, and a changed session found
by refresh cancel requests and remove old cached state before exposing the next
account. The provider also remounts its children, clearing component-local private
state. Late query/subscription responses and pending mutation callbacks cannot
populate or send writes for the next identity. A request already accepted by the
server cannot be undone by client-side cancellation.

Tabs share auth transition notifications through localStorage. They discard their
current private state as soon as a transition starts and verify the resulting
server session after it finishes. API responses and mutations check the shared
revision even before the storage event runs. Focus and restored-page events also
verify the session. When browser storage is disabled, cancellation remains local
to each tab and other tabs revalidate on focus. If a tab closes during sign-in,
reload another waiting tab to resolve the server session.

The service worker caches the application shell and public provider, genre, and
language metadata. Title listings and details include personalized fields, so
those and all other API responses use the network without browser persistence.
Private data requires a connection. Watchlist and episode writes fail offline;
they are not queued or promised to synchronize later. This intentionally trades
private offline browsing/writes for account isolation until the server supports
an account-bound offline protocol.

On worker activation, all legacy private API caches are deleted and the old
`track-queue` and `watched-queue` entries are discarded without replay. The worker
keeps handlers for their old sync registrations solely to discard remaining
entries, including sync events fired after all tabs close. Auth transitions and
initial page loads also purge legacy caches and queues directly, including when
no service worker currently controls the page. Public metadata caches survive
account changes. Reopened clients verify the session before rendering private
state; they cannot recover an old account's API responses from the worker.
Existing requests already dispatched by an old installed worker cannot be recalled;
installing the updated worker is required to apply the new storage/replay policy.

Run the focused real-provider/browser regression after building:

```sh
bun run build
bunx playwright test -c playwright.identity.config.ts
```

It uses Chromium, the real production AuthProvider, QueryClient and service worker,
and a real Bun auth/track backend with a fresh synthetic database under `.e2e`.
External network calls from that backend are disabled. No developer database or
real credentials are used. The public offline shell does not make private pages
available offline, and this work does not resolve the separate offline-navigation
or general offline-UX review issues.
