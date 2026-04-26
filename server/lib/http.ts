import { logger } from "../logger";
import { httpRetryTotal } from "../metrics";

const log = logger.child({ module: "http" });

export interface RetryOptions {
  maxRetries?: number; // default 3
  baseDelayMs?: number; // default 250
  maxDelayMs?: number; // default 30_000
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export async function httpFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 250, maxDelayMs = 30_000 } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) {
        return res;
      }
      // Retryable status
      if (attempt === maxRetries) return res; // Last attempt — return as-is
      const retryAfter = res.headers.get("Retry-After");
      const delay = retryAfter
        ? parseRetryAfter(retryAfter)
        : jitteredDelay(baseDelayMs, attempt, maxDelayMs);
      log.warn("Retryable HTTP error", {
        status: res.status,
        attempt,
        delay,
        url: String(input),
      });
      httpRetryTotal.inc({ status: String(res.status) });
      await sleep(delay);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = jitteredDelay(baseDelayMs, attempt, maxDelayMs);
      log.warn("HTTP fetch error, retrying", {
        attempt,
        delay,
        url: String(input),
        err,
      });
      httpRetryTotal.inc({ status: "network_error" });
      await sleep(delay);
    }
  }
  throw lastError ?? new Error("httpFetch exhausted retries");
}

function jitteredDelay(base: number, attempt: number, max: number): number {
  const exp = Math.min(base * 2 ** attempt, max);
  return exp * (0.5 + Math.random() * 0.5);
}

function parseRetryAfter(header: string): number {
  const sec = Number(header);
  if (!isNaN(sec)) return sec * 1000;
  const date = new Date(header);
  const diff = date.getTime() - Date.now();
  return Math.max(diff, 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
