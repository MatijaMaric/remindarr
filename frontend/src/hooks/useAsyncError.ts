import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface UseAsyncErrorResult {
  pending: boolean;
  error: string | null;
  reset: () => void;
  run: <T>(fn: () => Promise<T>, opts?: { silent?: boolean }) => Promise<T | undefined>;
}

export function useAsyncError(): UseAsyncErrorResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => setError(null), []);

  const run = useCallback(async <T>(
    fn: () => Promise<T>,
    opts?: { silent?: boolean },
  ): Promise<T | undefined> => {
    await Promise.resolve(); // defer setState to avoid react-hooks/set-state-in-effect
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (!opts?.silent) {
        toast.error(message);
      }
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, reset, run };
}
