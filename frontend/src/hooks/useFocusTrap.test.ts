import { describe, it, expect, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Helper — build a container with N buttons appended to document.body,
 * returning the container and the buttons.
 */
function buildContainer(count: number): { container: HTMLDivElement; buttons: HTMLButtonElement[] } {
  const container = document.createElement("div");
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.textContent = `Button ${i}`;
    container.appendChild(btn);
    buttons.push(btn);
  }
  document.body.appendChild(container);
  return { container, buttons };
}

function fireTab(shiftKey = false) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", bubbles: true, shiftKey }),
  );
}

describe("useFocusTrap", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    // Clean up any containers left in the DOM
    document.body.innerHTML = "";
    cleanup?.();
    cleanup = null;
  });

  it("focuses the first focusable child when isOpen becomes true", () => {
    const { container, buttons } = buildContainer(3);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useFocusTrap(ref, true);
    });

    expect(document.activeElement).toBe(buttons[0]);
    unmount();
  });

  it("wraps Tab from last focusable to first", () => {
    const { container, buttons } = buildContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useFocusTrap(ref, true);
    });

    // Move focus to last button
    act(() => {
      buttons[buttons.length - 1].focus();
    });
    expect(document.activeElement).toBe(buttons[2]);

    // Tab on last should wrap to first
    act(() => {
      fireTab(false);
    });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("wraps Shift+Tab from first focusable to last", () => {
    const { container, buttons } = buildContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useFocusTrap(ref, true);
    });

    // Focus is already on first button after trap engages
    expect(document.activeElement).toBe(buttons[0]);

    // Shift+Tab on first should wrap to last
    act(() => {
      fireTab(true);
    });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("restores focus to the opener when isOpen becomes false", () => {
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { container } = buildContainer(2);

    const { rerender, unmount } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => {
        const ref = useRef<HTMLDivElement>(container);
        useFocusTrap(ref, isOpen);
      },
      { initialProps: { isOpen: true } },
    );

    // Trap engaged — opener is no longer focused
    expect(document.activeElement).not.toBe(opener);

    // Close the trap
    rerender({ isOpen: false });

    expect(document.activeElement).toBe(opener);
    unmount();
  });

  it("does not wrap Tab when focus is not on the last element", () => {
    const { container, buttons } = buildContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useFocusTrap(ref, true);
    });

    // Manually move to middle button
    act(() => {
      buttons[1].focus();
    });

    // Tab should NOT wrap — focus should still be on buttons[1] since the
    // browser handles normal tab order. The hook only prevents wrap-around
    // escape, not tab navigation within the trap.
    act(() => {
      fireTab(false);
    });

    // Focus stayed on buttons[1] because the hook only intervenes on last→first
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("does nothing when isOpen is false from the start", () => {
    const { container } = buildContainer(2);
    const someOtherBtn = document.createElement("button");
    document.body.appendChild(someOtherBtn);
    someOtherBtn.focus();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useFocusTrap(ref, false);
    });

    // Focus should remain on someOtherBtn — trap is not active
    expect(document.activeElement).toBe(someOtherBtn);
  });
});
