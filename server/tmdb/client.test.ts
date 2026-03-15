import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock tracing to just call the function directly
mock.module("../tracing", () => ({
  traceHttp: (_method: string, _url: string, fn: () => Promise<unknown>) => fn(),
}));

// Mock config with a short timeout for testing
mock.module("../config", () => ({
  CONFIG: {
    TMDB_BASE_URL: "https://api.themoviedb.org/3",
    TMDB_API_KEY: "test-key",
    TMDB_API_TIMEOUT_MS: 100,
    COUNTRY: "US",
    LANGUAGE: "en",
    TMDB_IMAGE_BASE_URL: "https://image.tmdb.org/t/p",
  },
}));

// Import after mocks are set up
const { searchMulti } = await import("./client");

describe("tmdbRequest timeout", () => {
  beforeEach(() => {
    // Reset global fetch mock between tests
    globalThis.fetch = globalThis.fetch;
  });

  test("aborts request when timeout is exceeded", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      // Wait longer than the 100ms timeout
      await new Promise((resolve) => setTimeout(resolve, 500));
      // If signal wasn't aborted, return a response
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      await expect(searchMulti("test")).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("passes abort signal to fetch", async () => {
    let receivedSignal: AbortSignal | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ results: [], total_pages: 1, total_results: 0, page: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      await searchMulti("test");
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("completes successfully when response is fast", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ results: [{ id: 1 }], total_pages: 1, total_results: 1, page: 1 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    try {
      const result = await searchMulti("test");
      expect(result.results).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on non-ok response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    try {
      await expect(searchMulti("test")).rejects.toThrow("TMDB API error 404: Not Found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
