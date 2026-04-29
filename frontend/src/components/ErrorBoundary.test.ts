import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import * as Sentry from "@sentry/react";

const mockReloadPage = mock(() => {});

mock.module("../lib/reloadPage", () => ({
  reloadPage: mockReloadPage,
}));

import ErrorBoundary from "./ErrorBoundary";

let spyCapture: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockReloadPage.mockReset();
  spyCapture = spyOn(Sentry, "captureException").mockImplementation(() => "");

  // Shim caches (not implemented in happy-dom)
  Object.defineProperty(globalThis, "caches", {
    value: { delete: mock(() => Promise.resolve(true)) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  spyCapture.mockRestore();
});

describe("ErrorBoundary", () => {
  it("initializes with no error state", () => {
    const instance = new ErrorBoundary({ children: null });
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.error).toBeNull();
  });

  it("getDerivedStateFromError returns error state", () => {
    const error = new Error("test error");
    const state = ErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it("handleReset clears the error state", () => {
    const instance = new ErrorBoundary({ children: null });
    instance.state = { hasError: true, error: new Error("boom") };
    instance.setState = ((updater: Partial<{ hasError: boolean; error: Error | null }>) => {
      Object.assign(instance.state, updater);
    }) as typeof instance.setState;

    instance.handleReset();
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.error).toBeNull();
  });

  it("componentDidCatch tags non-chunk errors as 'render' in Sentry", async () => {
    const instance = new ErrorBoundary({ children: null });
    const error = new Error("render crash");
    const info = { componentStack: "<App>\n<ErrorBoundary>", digest: undefined };

    const origError = console.error;
    console.error = () => {};
    instance.componentDidCatch(error, info);
    console.error = origError;

    await new Promise((r) => setTimeout(r, 0));

    expect(spyCapture).toHaveBeenCalledWith(error, {
      tags: { errorType: "render" },
      contexts: { react: { componentStack: info.componentStack } },
    });
  });

  it("componentDidCatch tags chunk-load errors as 'chunk-load' in Sentry", async () => {
    const instance = new ErrorBoundary({ children: null });
    const error = new Error("error loading dynamically imported module: /assets/Foo.js");
    const info = { componentStack: "<App>", digest: undefined };

    const origError = console.error;
    console.error = () => {};
    instance.componentDidCatch(error, info);
    console.error = origError;

    await new Promise((r) => setTimeout(r, 0));

    expect(spyCapture).toHaveBeenCalledWith(error, {
      tags: { errorType: "chunk-load" },
      contexts: { react: { componentStack: info.componentStack } },
    });
  });

  it("handleReload deletes pages cache and reloads the page", async () => {
    const instance = new ErrorBoundary({ children: null });

    await instance.handleReload();

    expect((caches.delete as ReturnType<typeof mock>)).toHaveBeenCalledWith("pages");
    expect(mockReloadPage).toHaveBeenCalledTimes(1);
  });
});
