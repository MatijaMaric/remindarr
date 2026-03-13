import { describe, it, expect, beforeEach, mock } from "bun:test";

// Track fetch calls
let lastFetchUrl = "";
let lastFetchOptions: RequestInit | undefined;

const mockFetch = mock(async (url: string, options?: RequestInit) => {
  lastFetchUrl = url;
  lastFetchOptions = options;
  return new Response(
    JSON.stringify({ titles: [], page: 1, totalPages: 1 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

globalThis.fetch = mockFetch as any;

const { browseTitles } = await import("./api");

beforeEach(() => {
  lastFetchUrl = "";
  lastFetchOptions = undefined;
  mockFetch.mockClear();
});

describe("browseTitles", () => {
  it("calls /api/browse with category param", async () => {
    await browseTitles({ category: "popular" });
    expect(lastFetchUrl).toContain("/api/browse?");
    expect(lastFetchUrl).toContain("category=popular");
  });

  it("includes type param when provided", async () => {
    await browseTitles({ category: "upcoming", type: "MOVIE" });
    expect(lastFetchUrl).toContain("category=upcoming");
    expect(lastFetchUrl).toContain("type=MOVIE");
  });

  it("includes page param when provided", async () => {
    await browseTitles({ category: "top_rated", page: 3 });
    expect(lastFetchUrl).toContain("category=top_rated");
    expect(lastFetchUrl).toContain("page=3");
  });

  it("omits type param when not provided", async () => {
    await browseTitles({ category: "popular" });
    expect(lastFetchUrl).not.toContain("type=");
  });
});
