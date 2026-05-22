export type SessionVerdict =
  | "authenticated"
  | "unauthenticated"
  | "indeterminate";

interface SessionResult {
  data: unknown;
  error: { status?: number } | null;
}

export function classifySession(
  result: SessionResult | undefined,
  threw: boolean,
): SessionVerdict {
  if (threw || result === undefined) return "indeterminate";

  if (result.error != null) {
    const status = result.error.status;
    // undefined / 0 / >=500 are transient (network / server error)
    if (status === undefined || status === 0 || status >= 500)
      return "indeterminate";
    // 4xx (including 401/403) are definitive "not logged in"
    return "unauthenticated";
  }

  const data = result.data as { user?: unknown } | null;
  return data?.user ? "authenticated" : "unauthenticated";
}

const BACKOFF_MS = [300, 600, 900];

export async function resolveSession(
  getSession: () => Promise<SessionResult>,
  opts?: { retries?: number; sleep?: (ms: number) => Promise<void> },
): Promise<{ verdict: SessionVerdict; data: unknown }> {
  const retries = opts?.retries ?? 3;
  const sleep =
    opts?.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; attempt < retries; attempt++) {
    let result: SessionResult | undefined;
    let threw = false;

    try {
      result = await getSession();
    } catch {
      threw = true;
    }

    const verdict = classifySession(result, threw);

    if (verdict !== "indeterminate") {
      return { verdict, data: result?.data ?? null };
    }

    if (attempt < retries - 1) {
      await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
    }
  }

  return { verdict: "indeterminate", data: null };
}
