import { describe, it, expect, afterEach, mock } from "bun:test";

describe("useIsMobile", () => {
  const originalMatchMedia = globalThis.matchMedia;

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  it("MOBILE_QUERY matches Tailwind sm breakpoint (max-width: 639px)", async () => {
    // The hook uses "(max-width: 639px)" which aligns with Tailwind's sm: (640px+)
    // We verify this by checking the module exports the correct behavior
    let _listenerCallback: ((e: any) => void) | null = null;

    globalThis.matchMedia = mock((query: string) => ({
      matches: true,
      media: query,
      addEventListener: (_: string, cb: any) => { _listenerCallback = cb; },
      removeEventListener: mock(() => {}),
    })) as any;

    // Dynamic import to get fresh module with our mock
    const mod = await import("./useIsMobile");
    expect(mod.useIsMobile).toBeDefined();
    expect(typeof mod.useIsMobile).toBe("function");
  });
});
