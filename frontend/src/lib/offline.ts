import { authRevision, identityRequest } from "./identity";

export interface OfflineUser {
  id: string;
  username: string;
  display_name: string | null;
  auth_provider: string;
  is_admin: boolean;
}
interface OfflineSession {
  user: OfflineUser;
  expires: number;
  revision: string | null;
}
interface PendingWrite {
  id: string;
  account: string;
  url: string;
  method: string;
  body?: string;
  expires: number;
}
const DATABASE = "remindarr-offline-v1";
export const OFFLINE_TTL = 24 * 60 * 60 * 1000;
let account: string | null = null;
let replaying: Promise<void> | undefined;

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("state", mode);
      const request = operation(transaction.objectStore("state"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function setOfflineAccount(id: string | null) {
  account = id;
}
export async function clearOfflineData() {
  account = null;
  await transact("readwrite", (store) => store.clear());
  window.dispatchEvent(new Event("offline:changed"));
}

export async function offlineSession(): Promise<OfflineSession | null> {
  try {
    const session = await transact<OfflineSession | undefined>(
      "readonly",
      (store) => store.get("session"),
    );
    if (!session) return null;
    if (session.expires <= Date.now() || session.revision !== authRevision()) {
      await clearOfflineData();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function rememberSession(
  user: OfflineUser,
  sessionExpiry: string | undefined,
) {
  const identity = identityRequest();
  const revision = authRevision();
  const previous = await offlineSession();
  identity.check();
  if (previous && previous.user.id !== user.id) await clearOfflineData();
  identity.check();
  const expires = Math.min(
    Date.now() + OFFLINE_TTL,
    Date.parse(sessionExpiry ?? "") || Date.now(),
  );
  await transact("readwrite", (store) =>
    store.put({ user, expires, revision } satisfies OfflineSession, "session"),
  );
  identity.check();
  account = user.id;
}

function readable(url: string) {
  return (
    url === "/track" ||
    url === "/track/shelves" ||
    url.startsWith("/calendar?") ||
    url.startsWith("/details/")
  );
}

export async function offlineRead<T>(url: string): Promise<T | undefined> {
  if (!account || !readable(url)) return;
  const session = await offlineSession();
  if (session?.user.id !== account) return;
  const cached = await transact<{ value: T; expires: number } | undefined>(
    "readonly",
    (store) => store.get(`read:${account}:${url}`),
  );
  return cached && cached.expires > Date.now() ? cached.value : undefined;
}

export async function cacheOfflineRead(url: string, value: unknown) {
  if (!account || !readable(url) || JSON.stringify(value).length > 2_000_000)
    return;
  const owner = account;
  const identity = identityRequest();
  const session = await offlineSession();
  identity.check();
  if (session?.user.id !== owner) return;
  await transact("readwrite", (store) => {
    const result = store.put(
      { value, expires: session.expires },
      `read:${owner}:${url}`,
    );
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const reads = keys.result.filter((key) =>
        String(key).startsWith("read:"),
      );
      for (const key of reads.slice(0, Math.max(0, reads.length - 100)))
        store.delete(key);
    };
    return result;
  });
}

export async function queueWatchlist(
  url: string,
  method: string,
  body?: string,
) {
  const owner = account;
  const identity = identityRequest();
  const session = await offlineSession();
  identity.check();
  if (!owner || session?.user.id !== owner)
    throw new Error("Reconnect to verify your account before saving changes");
  const write: PendingWrite = {
    id: crypto.randomUUID(),
    account: owner,
    url,
    method,
    body,
    expires: session.expires,
  };
  // One durable desired state per title. A later remove supersedes a queued add.
  await transact("readwrite", (store) =>
    store.put(write, `write:${owner}:${url}`),
  );
  identity.check();
  window.dispatchEvent(new Event("offline:changed"));
  if (navigator.onLine) window.dispatchEvent(new Event("offline:retry"));
  return { queued: true };
}

export async function pendingWatchlist(): Promise<PendingWrite[]> {
  const session = await offlineSession();
  if (!session) return [];
  const values = await transact<unknown[]>("readonly", (store) =>
    store.getAll(),
  );
  return values.filter((value): value is PendingWrite => {
    const entry = value as PendingWrite;
    return (
      entry?.account === session.user.id &&
      typeof entry.url === "string" &&
      entry.expires > Date.now()
    );
  });
}

export function replayWatchlist(userId: string): Promise<void> {
  if (replaying) return replaying;
  const replay = async () => {
    const identity = identityRequest();
    const entries = await pendingWatchlist();
    if (!entries.length) return;
    for (const entry of entries) {
      identity.check();
      if (account !== userId || entry.account !== userId) return;
      const response = await fetch(`/api${entry.url}`, {
        method: entry.method,
        body: entry.body,
        signal: identity.signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Remindarr-Account": userId,
        },
      });
      identity.check();
      if (response.status === 401 || response.status === 409) {
        await clearOfflineData();
        window.dispatchEvent(new Event("auth:unauthorized"));
        return;
      }
      if (!response.ok)
        throw new Error(
          "Queued watchlist change could not sync. Reconnect and retry.",
        );
      await transact("readwrite", (store) => {
        const key = `write:${userId}:${entry.url}`;
        const read = store.get(key);
        read.onsuccess = () => {
          if (read.result?.id === entry.id) store.delete(key);
        };
        return read;
      });
    }
    window.dispatchEvent(new Event("offline:synced"));
    window.dispatchEvent(new Event("offline:changed"));
  };
  // Serialize replay across tabs as well as within this module.
  replaying = (
    navigator.locks
      ? navigator.locks.request("remindarr-offline-replay", replay)
      : replay()
  ).finally(() => {
    replaying = undefined;
  });
  return replaying;
}
