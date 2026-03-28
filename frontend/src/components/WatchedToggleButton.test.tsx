import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WatchedToggleButton from "./WatchedToggleButton";

afterEach(cleanup);

describe("WatchedToggleButton", () => {
  it("renders unwatched state with 'Watch' label (sm)", () => {
    render(<WatchedToggleButton watched={false} onClick={() => {}} size="sm" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Watch");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders watched state with 'Watched' label (sm)", () => {
    render(<WatchedToggleButton watched={true} onClick={() => {}} size="sm" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Watched");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders unwatched state with 'Mark watched' label (md)", () => {
    render(<WatchedToggleButton watched={false} onClick={() => {}} size="md" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Mark watched");
  });

  it("renders watched state with 'Watched' label (md)", () => {
    render(<WatchedToggleButton watched={true} onClick={() => {}} size="md" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Watched");
  });

  it("calls onClick when clicked", () => {
    const onClick = mock(() => {});
    render(<WatchedToggleButton watched={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stops event propagation on click", () => {
    const parentClick = mock(() => {});
    const onClick = mock(() => {});
    render(
      <div onClick={parentClick}>
        <WatchedToggleButton watched={false} onClick={onClick} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("renders disabled state as a span, not a button", () => {
    const { container } = render(
      <WatchedToggleButton watched={false} onClick={() => {}} disabled />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.className).toContain("cursor-not-allowed");
  });

  it("defaults to sm size", () => {
    render(<WatchedToggleButton watched={false} onClick={() => {}} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("rounded-full");
  });

  it("uses rounded-lg for md size", () => {
    render(<WatchedToggleButton watched={false} onClick={() => {}} size="md" />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("rounded-lg");
  });

  it("shows emerald styling when watched", () => {
    render(<WatchedToggleButton watched={true} onClick={() => {}} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-emerald-400");
  });

  it("shows zinc styling when unwatched", () => {
    render(<WatchedToggleButton watched={false} onClick={() => {}} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-zinc-400");
  });
});
