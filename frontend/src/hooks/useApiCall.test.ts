import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useApiCall } from "./useApiCall";

describe("useApiCall", () => {
  beforeEach(() => {
    globalThis.AbortController = AbortController;
    globalThis.DOMException = DOMException;
  });

  it("returns loading=true initially", () => {
    const fetcher = mock(() => new Promise(() => {}));
    const { result } = renderHook(() => useApiCall(fetcher, []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves data and sets loading=false on success", async () => {
    const fetcher = mock(() => Promise.resolve({ value: 42 }));
    const { result } = renderHook(() => useApiCall(fetcher, []));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ value: 42 });
    expect(result.current.error).toBeNull();
  });

  it("sets error on failure", async () => {
    const fetcher = mock(() => Promise.reject(new Error("network error")));
    const { result } = renderHook(() => useApiCall(fetcher, []));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("network error");
  });

  it("calls onSuccess callback with data", async () => {
    const onSuccess = mock(() => {});
    const fetcher = mock(() => Promise.resolve("hello"));

    const { result } = renderHook(() =>
      useApiCall(fetcher, [], { onSuccess }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("hello");
    expect(result.current.data).toBe("hello");
  });

  it("calls onError callback on failure", async () => {
    const onError = mock(() => {});
    const err = new Error("oops");
    const fetcher = mock(() => Promise.reject(err));

    renderHook(() => useApiCall(fetcher, [], { onError }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("refetch triggers a new fetch", async () => {
    let callCount = 0;
    const fetcher = mock(() => {
      callCount++;
      return Promise.resolve(callCount);
    });

    const { result } = renderHook(() => useApiCall(fetcher, []));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe(1);

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(result.current.data).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reruns when deps change", async () => {
    let id = 1;
    const fetcher = mock(() => Promise.resolve(`data-${id}`));

    const { result, rerender } = renderHook(() => useApiCall(fetcher, [id]));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe("data-1");

    id = 2;
    rerender();

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe("data-2");
  });

  it("does not update state after unmount", async () => {
    let resolve!: (value: string) => void;
    const fetcher = mock(
      () => new Promise<string>((res) => { resolve = res; }),
    );

    const { result, unmount } = renderHook(() => useApiCall(fetcher, []));

    unmount();

    await act(async () => {
      resolve("late data");
      await Promise.resolve();
    });

    // State should not have been updated — data remains null
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("retries on failure with retry option", async () => {
    let attempts = 0;
    const fetcher = mock(() => {
      attempts++;
      if (attempts < 3) return Promise.reject(new Error("fail"));
      return Promise.resolve("success");
    });

    const { result } = renderHook(() =>
      useApiCall(fetcher, [], { retry: 2, retryDelay: 0 }),
    );

    // Wait for retries (retryDelay=0 so they resolve synchronously-ish)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.data).toBe("success");
    expect(result.current.error).toBeNull();
    expect(attempts).toBe(3);
  });
});
