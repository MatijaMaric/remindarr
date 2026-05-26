import { describe, it, expect, afterEach, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useClickOutside } from "./useClickOutside";

function buildContainer(): {
  container: HTMLDivElement;
  inner: HTMLSpanElement;
} {
  const container = document.createElement("div");
  const inner = document.createElement("span");
  container.appendChild(inner);
  document.body.appendChild(container);
  return { container, inner };
}

describe("useClickOutside", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls onClose on mousedown outside the ref element", () => {
    const { container } = buildContainer();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const onClose = mock(() => {});

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, true, onClose);
    });

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          target: outside,
        } as MouseEventInit),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on mousedown inside the ref element", () => {
    const { container, inner } = buildContainer();
    const onClose = mock(() => {});

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, true, onClose);
    });

    act(() => {
      inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("calls onClose on Escape keydown", () => {
    const { container } = buildContainer();
    const onClose = mock(() => {});

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, true, onClose);
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for other keys", () => {
    const { container } = buildContainer();
    const onClose = mock(() => {});

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, true, onClose);
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("does nothing when enabled is false", () => {
    const { container } = buildContainer();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const onClose = mock(() => {});

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, false, onClose);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("detaches listeners on unmount", () => {
    const { container } = buildContainer();
    const onClose = mock(() => {});

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(container);
      useClickOutside(ref, true, onClose);
    });

    unmount();

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(0);
  });
});
