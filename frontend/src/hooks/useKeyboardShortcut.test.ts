import { describe, it, expect, beforeEach } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcut, isInputFocused } from "./useKeyboardShortcut";

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("isInputFocused", () => {
  it("returns false when body is focused", () => {
    document.body.focus();
    expect(isInputFocused()).toBe(false);
  });

  it("returns true when an input is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(isInputFocused()).toBe(true);
    document.body.removeChild(input);
  });

  it("returns true when a textarea is focused", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    expect(isInputFocused()).toBe(true);
    document.body.removeChild(ta);
  });
});

describe("useKeyboardShortcut", () => {
  let calls: number;

  beforeEach(() => {
    calls = 0;
    document.body.focus();
  });

  it("fires callback when key is pressed", () => {
    const { unmount } = renderHook(() => useKeyboardShortcut("j", () => calls++));
    fireKey("j");
    expect(calls).toBe(1);
    unmount();
  });

  it("does not fire for a different key", () => {
    const { unmount } = renderHook(() => useKeyboardShortcut("j", () => calls++));
    fireKey("k");
    expect(calls).toBe(0);
    unmount();
  });

  it("does not fire when an input is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const { unmount } = renderHook(() => useKeyboardShortcut("j", () => calls++));
    fireKey("j");
    expect(calls).toBe(0);

    unmount();
    document.body.removeChild(input);
  });

  it("does not fire with modifier keys", () => {
    const { unmount } = renderHook(() => useKeyboardShortcut("j", () => calls++));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true }));
    expect(calls).toBe(0);
    unmount();
  });

  it("removes listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardShortcut("j", () => calls++));
    unmount();
    fireKey("j");
    expect(calls).toBe(0);
  });

  it("always uses the latest callback without re-registering", () => {
    const { rerender, unmount } = renderHook(
      ({ val }: { val: number }) => useKeyboardShortcut("j", () => { calls += val; }),
      { initialProps: { val: 1 } }
    );
    rerender({ val: 10 });
    fireKey("j");
    // Should use updated callback value of 10
    expect(calls).toBe(10);
    unmount();
  });
});
