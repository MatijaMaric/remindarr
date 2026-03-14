import { describe, it, expect } from "bun:test";
import ErrorBoundary from "./ErrorBoundary";

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
    // Mock setState to apply state directly
    instance.setState = ((updater: Partial<{ hasError: boolean; error: Error | null }>) => {
      Object.assign(instance.state, updater);
    }) as typeof instance.setState;

    instance.handleReset();
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.error).toBeNull();
  });
});
