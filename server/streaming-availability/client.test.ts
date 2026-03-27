import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import Sentry from "../sentry";
import { CONFIG } from "../config";
import { RateLimitError } from "./types";

// Mock Sentry tracing
let sentrySpy: ReturnType<typeof spyOn>;
let fetchSpy: ReturnType<typeof spyOn>;

const originalApiKey = CONFIG.STREAMING_AVAILABILITY_API_KEY;

beforeEach(() => {
  sentrySpy = spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
  fetchSpy = spyOn(globalThis, "fetch");
  CONFIG.STREAMING_AVAILABILITY_API_KEY = "test-api-key";
});

afterEach(() => {
  sentrySpy?.mockRestore();
  fetchSpy?.mockRestore();
  CONFIG.STREAMING_AVAILABILITY_API_KEY = originalApiKey;
});

import { fetchStreamingOptions } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchStreamingOptions", () => {
  it("fetches streaming options for a movie", async () => {
    const mockResponse = {
      streamingOptions: {
        us: [
          {
            service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: {} },
            type: "subscription",
            link: "https://www.netflix.com/watch/12345",
            quality: "hd",
          },
        ],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(550, "MOVIE", "US");

    expect(result).toHaveLength(1);
    expect(result[0].link).toBe("https://www.netflix.com/watch/12345");
    expect(result[0].service.id).toBe("netflix");

    const fetchCall = fetchSpy.mock.calls[0];
    expect(fetchCall[0]).toContain("/shows/movie/550");
    expect(fetchCall[0]).toContain("country=us");
  });

  it("fetches streaming options for a TV show", async () => {
    const mockResponse = {
      streamingOptions: {
        us: [
          {
            service: { id: "disney", name: "Disney+", homePage: "", themeColorCode: "", imageSet: {} },
            type: "subscription",
            link: "https://www.disneyplus.com/series/123",
          },
        ],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(1396, "SHOW", "US");

    expect(result).toHaveLength(1);
    const fetchCall = fetchSpy.mock.calls[0];
    expect(fetchCall[0]).toContain("/shows/tv/1396");
  });

  it("returns empty array on 404", async () => {
    fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const result = await fetchStreamingOptions(999999, "MOVIE", "US");
    expect(result).toEqual([]);
  });

  it("throws RateLimitError on 429", async () => {
    fetchSpy.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws on other HTTP errors", async () => {
    fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toThrow("SA API error: 500");
  });

  it("returns empty array when country has no options", async () => {
    const mockResponse = {
      streamingOptions: {
        gb: [{ service: { id: "netflix" }, type: "subscription", link: "https://netflix.com/1" }],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(550, "MOVIE", "US");
    expect(result).toEqual([]);
  });

  it("sends correct headers", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ streamingOptions: {} }));

    await fetchStreamingOptions(550, "MOVIE", "US");

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["X-RapidAPI-Key"]).toBe("test-api-key");
    expect(headers["X-RapidAPI-Host"]).toBe("streaming-availability.p.rapidapi.com");
  });
});
