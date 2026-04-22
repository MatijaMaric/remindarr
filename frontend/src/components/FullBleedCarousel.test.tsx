import { describe, it, expect, afterEach, beforeEach, mock } from "bun:test";
import { render, cleanup, fireEvent } from "@testing-library/react";
import FullBleedCarousel from "./FullBleedCarousel";

beforeEach(() => {
  // FullBleedCarousel uses ResizeObserver internally
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
});

describe("FullBleedCarousel", () => {
  it("renders children", () => {
    const { getByTestId } = render(
      <FullBleedCarousel>
        <div data-testid="child-1">Item 1</div>
        <div data-testid="child-2">Item 2</div>
      </FullBleedCarousel>,
    );
    expect(getByTestId("child-1")).toBeDefined();
    expect(getByTestId("child-2")).toBeDefined();
  });

  it("hides vertical overflow so horizontal scroll container does not produce a vertical scrollbar", () => {
    const { container } = render(
      <FullBleedCarousel>
        <div>Item</div>
      </FullBleedCarousel>,
    );
    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    expect(scrollDiv.className).toContain("overflow-y-hidden");
  });

  it("applies scroll-padding matching padding so snap respects the inset", () => {
    const { container } = render(
      <FullBleedCarousel>
        <div>Item</div>
      </FullBleedCarousel>,
    );
    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    const style = scrollDiv.getAttribute("style") ?? "";
    expect(style).toContain("scroll-padding-left");
    expect(style).toContain("scroll-padding-right");
    // scroll-snap-type is NOT in the inline style — it is set imperatively
    // after scrollLeft = 0 via requestAnimationFrame to prevent mandatory
    // snap from overriding the initial scroll position
    expect(style).not.toContain("scroll-snap-type");
  });

  it("hides scroll buttons when content does not overflow", () => {
    const { container } = render(
      <FullBleedCarousel>
        <div>Short content</div>
      </FullBleedCarousel>,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("shows both scroll buttons when scrolled to the middle", () => {
    const { container } = render(
      <FullBleedCarousel>
        <div>Item</div>
      </FullBleedCarousel>,
    );

    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 300, writable: true });

    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
  });

  it("shows only right button when at the start", () => {
    const { container } = render(
      <FullBleedCarousel>
        <div>Item</div>
      </FullBleedCarousel>,
    );

    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 0, writable: true });

    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
  });

  it("calls scrollBy with visible content width (clientWidth minus padding)", () => {
    const scrollByMock = mock(() => {});

    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = ((el: Element) => {
      const real = originalGetComputedStyle(el);
      return new Proxy(real, {
        get(target, prop) {
          if (prop === "paddingLeft") return "80px";
          if (prop === "paddingRight") return "80px";
          const val = Reflect.get(target, prop);
          return typeof val === "function" ? val.bind(target) : val;
        },
      });
    }) as typeof window.getComputedStyle;

    const { container } = render(
      <FullBleedCarousel>
        <div>Item</div>
      </FullBleedCarousel>,
    );

    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 300, writable: true });
    scrollDiv.scrollBy = scrollByMock;

    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);

    // Click left button — scrolls by visible content width (400 - 80 - 80 = 240)
    fireEvent.click(buttons[0]);
    expect(scrollByMock).toHaveBeenCalledWith({
      left: -240,
      behavior: "smooth",
    });

    // Click right button — scrolls by visible content width (400 - 80 - 80 = 240)
    fireEvent.click(buttons[1]);
    expect(scrollByMock).toHaveBeenCalledWith({
      left: 240,
      behavior: "smooth",
    });

    window.getComputedStyle = originalGetComputedStyle;
  });
});
