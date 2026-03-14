import { describe, it, expect, mock } from "bun:test";
import ErrorBoundary from "./ErrorBoundary";

// Mock Sentry to prevent actual calls
mock.module("@sentry/react", () => ({
  captureException: mock(() => {}),
}));

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
    const Sentry = await import("@sentry/react");
    const instance = new ErrorBoundary({ children: null });
    const error = new Error("render crash");
    const info = { componentStack: "<App>\n<ErrorBoundary>", digest: undefined };

    // Suppress structured log output during test
    const origError = console.error;
    console.error = () => {};
    instance.componentDidCatch(error, info);
    console.error = origError;

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  });
});
