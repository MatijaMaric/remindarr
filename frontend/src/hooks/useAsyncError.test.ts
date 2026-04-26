import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";

const toastError = mock(() => {});
const toastSuccess = mock(() => {});

mock.module("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { useAsyncError } from "./useAsyncError";

describe("useAsyncError", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("starts with pending=false and error=null", () => {
    const { result } = renderHook(() => useAsyncError());
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("run() sets pending true during execution and false after", async () => {
    let resolveFn!: () => void;
    const fn = () => new Promise<void>((res) => { resolveFn = res; });

    const { result } = renderHook(() => useAsyncError());

    let runPromise!: Promise<void | undefined>;
    act(() => {
      runPromise = result.current.run(fn);
    });

    // Flush the microtask that defers setPending(true)
    await act(async () => { await Promise.resolve(); });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveFn();
      await runPromise;
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("run() on success returns the resolved value", async () => {
    const { result } = renderHook(() => useAsyncError());
    let value: number | undefined;

    await act(async () => {
      value = await result.current.run(() => Promise.resolve(42));
    });

    expect(value).toBe(42);
    expect(result.current.error).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("run() on failure sets error and calls toast.error", async () => {
    const { result } = renderHook(() => useAsyncError());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("something went wrong")));
    });

    expect(result.current.error).toBe("something went wrong");
    expect(result.current.pending).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("something went wrong");
  });

  it("run() on failure with a non-Error value stringifies it", async () => {
    const { result } = renderHook(() => useAsyncError());

    await act(async () => {
      await result.current.run(() => Promise.reject("plain string error"));
    });

    expect(result.current.error).toBe("plain string error");
    expect(toastError).toHaveBeenCalledWith("plain string error");
  });

  it("run() with { silent: true } sets error but does NOT call toast.error", async () => {
    const { result } = renderHook(() => useAsyncError());

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error("silent fail")),
        { silent: true },
      );
    });

    expect(result.current.error).toBe("silent fail");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reset() clears error back to null", async () => {
    const { result } = renderHook(() => useAsyncError());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("oops")));
    });

    expect(result.current.error).toBe("oops");

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
  });

  it("run() clears previous error before executing", async () => {
    const { result } = renderHook(() => useAsyncError());

    // First run — fail
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("first error")));
    });

    expect(result.current.error).toBe("first error");

    // Second run — succeed
    await act(async () => {
      await result.current.run(() => Promise.resolve("ok"));
    });

    expect(result.current.error).toBeNull();
  });
});
