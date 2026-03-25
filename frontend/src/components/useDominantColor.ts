import { useState, useEffect } from "react";
import { FastAverageColor } from "fast-average-color";

const fac = new FastAverageColor();
const cache = new Map<string, { color: string; isDark: boolean }>();

const DEFAULT_COLOR = { color: "rgb(24, 24, 27)", isDark: true };

function getCachedOrDefault(url: string | null): { color: string; isDark: boolean } {
  if (!url) return DEFAULT_COLOR;
  return cache.get(url) ?? DEFAULT_COLOR;
}

export function useDominantColor(imageUrl: string | null): {
  color: string;
  isDark: boolean;
} {
  const [result, setResult] = useState(() => getCachedOrDefault(imageUrl));

  useEffect(() => {
    if (!imageUrl || cache.has(imageUrl)) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      if (cancelled) return;
      try {
        const avgColor = fac.getColor(img);
        const entry = { color: avgColor.hex, isDark: avgColor.isDark };
        cache.set(imageUrl, entry);
        setResult(entry);
      } catch {
        // Canvas extraction failed — keep default
      }
    };

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Sync with cache when URL changes (handles already-cached URLs on re-render)
  const cached = imageUrl ? cache.get(imageUrl) : null;
  const syncedResult = cached ?? result;
  if (syncedResult !== result && cached) {
    return cached;
  }

  return result;
}

/** Hook that precomputes dominant colors for multiple URLs at once */
export function useDominantColors(
  imageUrls: (string | null)[]
): { color: string; isDark: boolean }[] {
  const urlKey = imageUrls.join(",");

  const [results, setResults] = useState<{ color: string; isDark: boolean }[]>(
    () => imageUrls.map((url) => getCachedOrDefault(url))
  );

  useEffect(() => {
    // Check if any URLs need fetching
    const urls = urlKey.split(",").map((u) => (u === "" ? null : u));
    const uncached = urls.filter((url) => url && !cache.has(url));
    if (uncached.length === 0) {
      // All cached or null — set from cache
      return;
    }

    let cancelled = false;
    const pending = urls.map((url, i) => {
      if (!url || cache.has(url)) {
        return Promise.resolve({ index: i, result: getCachedOrDefault(url) });
      }

      return new Promise<{
        index: number;
        result: { color: string; isDark: boolean };
      }>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        img.onload = () => {
          try {
            const avgColor = fac.getColor(img);
            const entry = { color: avgColor.hex, isDark: avgColor.isDark };
            cache.set(url, entry);
            resolve({ index: i, result: entry });
          } catch {
            resolve({ index: i, result: DEFAULT_COLOR });
          }
        };
        img.onerror = () => resolve({ index: i, result: DEFAULT_COLOR });
      });
    });

    Promise.all(pending).then((entries) => {
      if (cancelled) return;
      const newResults = urls.map((url) => getCachedOrDefault(url));
      for (const { index, result } of entries) {
        newResults[index] = result;
      }
      setResults(newResults);
    });

    return () => {
      cancelled = true;
    };
  }, [urlKey]);

  return results;
}
