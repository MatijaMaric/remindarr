import { describe, it, expect, afterEach, mock } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ScrollableRow from "./ScrollableRow";

afterEach(() => {
  cleanup();
});

describe("ScrollableRow", () => {
  it("renders children", () => {
    render(
      <ScrollableRow>
        <div data-testid="child-1">Item 1</div>
        <div data-testid="child-2">Item 2</div>
      </ScrollableRow>,
    );
    expect(screen.getByTestId("child-1")).toBeDefined();
    expect(screen.getByTestId("child-2")).toBeDefined();
  });

  it("applies custom className to the scroll container", () => {
    const { container } = render(
      <ScrollableRow className="gap-4 pb-2">
        <div>Item</div>
      </ScrollableRow>,
    );
    const scrollDiv = container.querySelector(".gap-4.pb-2");
    expect(scrollDiv).toBeDefined();
  });

  it("applies scroll-snap style when scrollSnap is true", () => {
    const { container } = render(
      <ScrollableRow scrollSnap>
        <div>Item</div>
      </ScrollableRow>,
    );
    const scrollDiv = container.querySelector("[style]");
    expect(scrollDiv).toBeDefined();
    expect(scrollDiv!.getAttribute("style")).toContain("scroll-snap-type");
  });

  it("does not apply scroll-snap style when scrollSnap is false", () => {
    const { container } = render(
      <ScrollableRow>
        <div>Item</div>
      </ScrollableRow>,
    );
    const scrollDiv = container.querySelector(".overflow-x-auto");
    expect(scrollDiv).toBeDefined();
    expect(scrollDiv!.getAttribute("style")).toBeNull();
  });

  it("hides scroll buttons when content does not overflow", () => {
    const { container } = render(
      <ScrollableRow>
        <div>Short content</div>
      </ScrollableRow>,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("calls scrollBy when scroll button is clicked", () => {
    const scrollByMock = mock(() => {});

    const { container } = render(
      <ScrollableRow>
        <div>Item</div>
      </ScrollableRow>,
    );

    // Simulate overflow by manipulating the scroll container
    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 100, writable: true });
    scrollDiv.scrollBy = scrollByMock;

    // Trigger scroll event to update button visibility
    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);

    // Click right button — scrolls by clientWidth (400)
    fireEvent.click(buttons[1]);
    expect(scrollByMock).toHaveBeenCalledWith({
      left: 400,
      behavior: "smooth",
    });

    // Click left button — scrolls by clientWidth (400)
    fireEvent.click(buttons[0]);
    expect(scrollByMock).toHaveBeenCalledWith({
      left: -400,
      behavior: "smooth",
    });
  });

  it("shows only right button when at the start", () => {
    const { container } = render(
      <ScrollableRow>
        <div>Item</div>
      </ScrollableRow>,
    );

    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 0, writable: true });

    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
  });

  it("shows only left button when at the end", () => {
    const { container } = render(
      <ScrollableRow>
        <div>Item</div>
      </ScrollableRow>,
    );

    const scrollDiv = container.querySelector(".overflow-x-auto") as HTMLDivElement;
    Object.defineProperty(scrollDiv, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scrollDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scrollDiv, "scrollLeft", { value: 600, writable: true });

    fireEvent.scroll(scrollDiv);

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
  });
});
