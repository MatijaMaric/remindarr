import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useScrollRestoration } from "./useScrollRestoration";

describe("useScrollRestoration", () => {
  const KEY = "test-page";
  const STORAGE_KEY = `scroll:${KEY}`;
  let scrollToMock: ReturnType<typeof mock>;

  beforeEach(() => {
    sessionStorage.clear();
    scrollToMock = mock(() => {});
    window.scrollTo = scrollToMock as any;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("restores saved scroll position when ready is true", () => {
    sessionStorage.setItem(STORAGE_KEY, "500");
    renderHook(() => useScrollRestoration(KEY, true));
    expect(scrollToMock).toHaveBeenCalledWith({ top: 500, behavior: "instant" });
  });

  it("does not restore when ready is false", () => {
    sessionStorage.setItem(STORAGE_KEY, "500");
    renderHook(() => useScrollRestoration(KEY, false));
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("restores when ready transitions from false to true", () => {
    sessionStorage.setItem(STORAGE_KEY, "250");
    let ready = false;
    const { rerender } = renderHook(() => useScrollRestoration(KEY, ready));
    expect(scrollToMock).not.toHaveBeenCalled();

    ready = true;
    rerender();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 250, behavior: "instant" });
  });

  it("restores only once even on multiple re-renders", () => {
    sessionStorage.setItem(STORAGE_KEY, "100");
    const { rerender } = renderHook(() => useScrollRestoration(KEY, true));
    rerender();
    rerender();
    expect(scrollToMock.mock.calls.length).toBe(1);
  });

  it("does not scroll when no saved position exists", () => {
    renderHook(() => useScrollRestoration(KEY, true));
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("saves current scroll position to sessionStorage on unmount", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 750 });
    const { unmount } = renderHook(() => useScrollRestoration(KEY, true));
    unmount();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("750");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });
});
