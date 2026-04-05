import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import "../i18n";

afterEach(cleanup);

describe("KeyboardShortcutsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <KeyboardShortcutsModal open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when open", () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("calls onClose when backdrop is clicked", () => {
    let closed = false;
    render(<KeyboardShortcutsModal open={true} onClose={() => { closed = true; }} />);
    const backdrop = document.querySelector(".absolute.inset-0.bg-black\\/60") as HTMLElement;
    fireEvent.click(backdrop);
    expect(closed).toBe(true);
  });

  it("calls onClose when Escape is pressed", () => {
    let closed = false;
    render(<KeyboardShortcutsModal open={true} onClose={() => { closed = true; }} />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closed).toBe(true);
  });

  it("shows shortcut keys", () => {
    render(<KeyboardShortcutsModal open={true} onClose={() => {}} />);
    expect(screen.getByText("/")).toBeDefined();
    expect(screen.getByText("j")).toBeDefined();
    expect(screen.getByText("k")).toBeDefined();
  });
});
