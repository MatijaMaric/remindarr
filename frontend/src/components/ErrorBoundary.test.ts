import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as Sentry from "@sentry/react";
import ErrorBoundary from "./ErrorBoundary";

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(Sentry, "captureException").mockImplementation(() => ""),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
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

  it("componentDidCatch reports to Sentry", async () => {
    const instance = new ErrorBoundary({ children: null });
    const error = new Error("render crash");
    const info = { componentStack: "<App>\n<ErrorBoundary>", digest: undefined };

    // Suppress structured log output during test
    const origError = console.error;
    console.error = () => {};
    instance.componentDidCatch(error, info);
    console.error = origError;

    // Wait for the dynamic import to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  });
});
