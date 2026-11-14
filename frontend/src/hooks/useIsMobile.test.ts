import { describe, it, expect, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

type Listener = (e: { matches: boolean }) => void;

/** A controllable matchMedia: every MediaQueryList reads the same live `matches`. */
function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const state = {
    matches: initial,
    queries: [] as string[],
    listeners,
    /** Runs just before a `change` listener is attached. */
    beforeSubscribe: () => {},
    change(next: boolean) {
      state.matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
  };
  globalThis.matchMedia = ((query: string) => {
    state.queries.push(query);
    return {
      get matches() {
        return state.matches;
      },
      media: query,
      addEventListener: (_: string, cb: Listener) => {
        state.beforeSubscribe();
        listeners.add(cb);
      },
      removeEventListener: (_: string, cb: Listener) => {
        listeners.delete(cb);
      },
    };
  }) as any;
  return state;
}

describe("useIsMobile", () => {
  const originalMatchMedia = globalThis.matchMedia;

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  it("defaults to the Tailwind sm breakpoint query (max-width: 639px)", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(media.queries).toContain("(max-width: 639px)");
  });

  it("updates when the media query changes", () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.change(true));
    expect(result.current).toBe(true);

    act(() => media.change(false));
    expect(result.current).toBe(false);
  });

  // Regression (#1401): the viewport crossed the breakpoint after the first
  // render but before the `change` listener was attached, so no event was ever
  // delivered and the hook stayed on the value from its first render.
  it("picks up a change that happens between first render and subscribing", () => {
    const media = mockMatchMedia(false);
    media.beforeSubscribe = () => {
      media.matches = true; // no listener yet, so no change event fires
    };

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const media = mockMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(media.listeners.size).toBe(1);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
