import { useState, useEffect, useCallback, useRef, type DependencyList } from "react";

export interface UseApiCallOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  /** Number of retry attempts on failure (default: 0) */
  retry?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryDelay?: number;
}

export interface UseApiCallResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function fetchWithRetry<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  retries: number,
  retryDelay: number,
  signal: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fetcher(signal);
    } catch (err) {
      lastError = err;
      if (signal.aborted) throw err;
      if (attempt < retries) {
        await sleep(retryDelay * Math.pow(2, attempt), signal);
      }
    }
  }
  throw lastError;
}

export function useApiCall<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  options?: UseApiCallOptions<T>,
): UseApiCallResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const { retry = 0, retryDelay = 1000, onSuccess, onError } = optionsRef.current ?? {};

    setLoading(true);
    setError(null);

    fetchWithRetry(fetcher, retry, retryDelay, signal)
      .then((result) => {
        if (signal.aborted) return;
        setData(result);
        onSuccess?.(result);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        onError?.(err instanceof Error ? err : new Error(message));
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refetch };
}
