import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const mockUpdateAllRegistrations = mock(() => Promise.resolve());
const mockClearPagesCache = mock(() => Promise.resolve());

mock.module("./swControl", () => ({
  updateAllRegistrations: mockUpdateAllRegistrations,
  clearPagesCache: mockClearPagesCache,
}));

const mockReloadPage = mock(() => {});

mock.module("./reloadPage", () => ({
  reloadPage: mockReloadPage,
}));

import { isChunkLoadError, loadWithRetry } from "./lazyWithRetry";

const LAZY_RETRY_KEY = "__lazy_retry";
const MOD = { default: (() => null) as React.ComponentType };

// Runs loadWithRetry but races with a 100ms timeout since retry paths return a never-resolving promise.
async function runWithTimeout(factory: () => Promise<{ default: React.ComponentType }>) {
  return Promise.race([
    loadWithRetry(factory).catch((e: unknown) => ({ threw: e })),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
  ]);
}

beforeEach(() => {
  sessionStorage.clear();
  mockUpdateAllRegistrations.mockReset();
  mockClearPagesCache.mockReset();
  mockReloadPage.mockReset();
  mockUpdateAllRegistrations.mockImplementation(() => Promise.resolve());
  mockClearPagesCache.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  sessionStorage.clear();
});

describe("isChunkLoadError", () => {
  it("matches Chrome error message", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://example.com/assets/foo.js"))).toBe(true);
  });

  it("matches Firefox error message", () => {
    expect(isChunkLoadError(new Error("error loading dynamically imported module: https://example.com/assets/bar.js"))).toBe(true);
  });

  it("matches Safari error message", () => {
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
  });

  it("matches webpack/vite chunk error", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isChunkLoadError(new Error("Cannot read property 'foo' of undefined"))).toBe(false);
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("string error")).toBe(false);
  });
});

describe("loadWithRetry", () => {
  it("returns module and resets retry counter on success", async () => {
    sessionStorage.setItem(LAZY_RETRY_KEY, "1");
    const factory = mock(() => Promise.resolve(MOD));

    const result = await loadWithRetry(factory);

    expect(result).toBe(MOD);
    expect(sessionStorage.getItem(LAZY_RETRY_KEY)).toBeNull();
    expect(mockReloadPage).not.toHaveBeenCalled();
  });

  it("rethrows non-chunk errors immediately without reload", async () => {
    const runtimeError = new Error("Cannot read properties of undefined");
    const factory = mock(() => Promise.reject(runtimeError));

    const result = await runWithTimeout(factory);

    expect(result).toMatchObject({ threw: runtimeError });
    expect(mockReloadPage).not.toHaveBeenCalled();
    expect(mockUpdateAllRegistrations).not.toHaveBeenCalled();
    expect(mockClearPagesCache).not.toHaveBeenCalled();
  });

  it("retry 0 → 1: calls updateAllRegistrations then reloadPage", async () => {
    const chunkError = new Error("Failed to fetch dynamically imported module: /assets/Foo.js");
    const factory = mock(() => Promise.reject(chunkError));

    await runWithTimeout(factory);

    expect(sessionStorage.getItem(LAZY_RETRY_KEY)).toBe("1");
    expect(mockUpdateAllRegistrations).toHaveBeenCalledTimes(1);
    expect(mockClearPagesCache).not.toHaveBeenCalled();
    expect(mockReloadPage).toHaveBeenCalledTimes(1);
  });

  it("retry 1 → 2: calls clearPagesCache then reloadPage", async () => {
    sessionStorage.setItem(LAZY_RETRY_KEY, "1");
    const chunkError = new Error("error loading dynamically imported module: /assets/Bar.js");
    const factory = mock(() => Promise.reject(chunkError));

    await runWithTimeout(factory);

    expect(sessionStorage.getItem(LAZY_RETRY_KEY)).toBe("2");
    expect(mockUpdateAllRegistrations).not.toHaveBeenCalled();
    expect(mockClearPagesCache).toHaveBeenCalledTimes(1);
    expect(mockReloadPage).toHaveBeenCalledTimes(1);
  });

  it("retry 2 → 3: tags error with isChunkLoadError=true and clears counter", async () => {
    sessionStorage.setItem(LAZY_RETRY_KEY, "2");
    const chunkError = new Error("Importing a module script failed.");
    const factory = mock(() => Promise.reject(chunkError));

    const result = await runWithTimeout(factory);

    expect(result).toMatchObject({ threw: expect.objectContaining({ isChunkLoadError: true }) });
    expect(sessionStorage.getItem(LAZY_RETRY_KEY)).toBeNull();
    expect(mockReloadPage).not.toHaveBeenCalled();
  });

  it("all browser error variants trigger retry", async () => {
    const messages = [
      "Failed to fetch dynamically imported module: /a.js",
      "error loading dynamically imported module: /b.js",
      "Importing a module script failed.",
      "Loading chunk 99 failed.",
    ];

    for (const message of messages) {
      sessionStorage.clear();
      mockReloadPage.mockReset();
      const factory = mock(() => Promise.reject(new Error(message)));
      await runWithTimeout(factory);
      expect(mockReloadPage).toHaveBeenCalledTimes(1);
    }
  });
});
