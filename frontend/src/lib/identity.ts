export const AUTH_CHANGE_KEY = "remindarr:auth-change";

let requests = new AbortController();

export function cancelIdentityRequests() {
  requests.abort();
  requests = new AbortController();
}

export function authRevision(): string | null {
  try {
    const value = localStorage.getItem(AUTH_CHANGE_KEY);
    try {
      return JSON.parse(value ?? "null")?.nonce ?? value;
    } catch {
      return value;
    }
  } catch {
    return null;
  }
}

export function identityRequest(signal?: AbortSignal | null) {
  const identitySignal = requests.signal;
  const revision = authRevision();
  return {
    signal: signal ? AbortSignal.any([identitySignal, signal]) : identitySignal,
    check() {
      identitySignal.throwIfAborted();
      if (revision !== authRevision()) {
        throw new DOMException("Account changed", "AbortError");
      }
    },
  };
}
