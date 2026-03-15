import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";

// Track fetch calls
let lastFetchUrl = "";
let lastFetchOptions: RequestInit | undefined;
let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  lastFetchUrl = "";
  lastFetchOptions = undefined;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL | Request, options?: RequestInit) => {
    lastFetchUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    lastFetchOptions = options;
    return new Response(
      JSON.stringify({ titles: [], page: 1, totalPages: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const { browseTitles, getAdminSettings, updateAdminSettings } = await import("./api");

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

describe("getAdminSettings", () => {
  it("calls /api/admin/settings", async () => {
    const mockSettings = {
      oidc: {
        issuer_url: { value: "https://example.com", source: "db" },
        client_id: { value: "my-client", source: "db" },
        client_secret: { value: "********", source: "db" },
        redirect_uri: { value: "", source: "unset" },
        admin_claim: { value: "", source: "unset" },
        admin_value: { value: "", source: "unset" },
      },
      oidc_configured: true,
    };
    fetchSpy.mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      lastFetchUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      lastFetchOptions = options;
      return new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await getAdminSettings();
    expect(lastFetchUrl).toBe("/api/admin/settings");
    expect(result.oidc_configured).toBe(true);
    expect(result.oidc.issuer_url.value).toBe("https://example.com");
    expect(result.oidc.issuer_url.source).toBe("db");
  });
});

describe("updateAdminSettings", () => {
  it("calls PUT /api/admin/settings with body", async () => {
    const mockResponse = { success: true, oidc_configured: true };
    fetchSpy.mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      lastFetchUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      lastFetchOptions = options;
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await updateAdminSettings({
      oidc_issuer_url: "https://example.com",
      oidc_client_id: "my-client",
    });
    expect(lastFetchUrl).toBe("/api/admin/settings");
    expect(lastFetchOptions?.method).toBe("PUT");
    const body = JSON.parse(lastFetchOptions?.body as string);
    expect(body.oidc_issuer_url).toBe("https://example.com");
    expect(body.oidc_client_id).toBe("my-client");
    expect(result.success).toBe(true);
    expect(result.oidc_configured).toBe(true);
  });
});
