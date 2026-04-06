import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import ReelsUndoBar from "./ReelsUndoBar";

afterEach(cleanup);

const defaultProps = {
  episodeCode: "S01E03",
  currentRating: null as null,
  onRate: mock(() => {}),
  onUndo: mock(() => {}),
};

describe("ReelsUndoBar", () => {
  it("displays the episode code", () => {
    render(<ReelsUndoBar {...defaultProps} />);
    expect(screen.getByText("Marked S01E03")).toBeDefined();
  });

  it("renders all four rating buttons", () => {
    render(<ReelsUndoBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Hate" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dislike" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
  });

  it("renders the undo button", () => {
    render(<ReelsUndoBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
    expect(screen.getByText("Undo")).toBeDefined();
  });

  it("calls onRate when a rating button is clicked", () => {
    const onRate = mock(() => {});
    render(<ReelsUndoBar {...defaultProps} onRate={onRate} />);
    screen.getByRole("button", { name: "Like" }).click();
    expect(onRate).toHaveBeenCalledWith("LIKE");
  });

  it("calls onUndo when undo button is clicked", () => {
    const onUndo = mock(() => {});
    render(<ReelsUndoBar {...defaultProps} onUndo={onUndo} />);
    screen.getByRole("button", { name: "Undo" }).click();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("marks the active rating button with aria-pressed", () => {
    render(<ReelsUndoBar {...defaultProps} currentRating="LOVE" />);
    expect(screen.getByRole("button", { name: "Love" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hate" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("applies active styling to the selected rating", () => {
    render(<ReelsUndoBar {...defaultProps} currentRating="DISLIKE" />);
    const btn = screen.getByRole("button", { name: "Dislike" });
    expect(btn.className).toContain("bg-amber-500");
  });

  it("calls onRate with each rating value correctly", () => {
    const onRate = mock(() => {});
    render(<ReelsUndoBar {...defaultProps} onRate={onRate} />);
    screen.getByRole("button", { name: "Hate" }).click();
    expect(onRate).toHaveBeenCalledWith("HATE");
    screen.getByRole("button", { name: "Dislike" }).click();
    expect(onRate).toHaveBeenCalledWith("DISLIKE");
    screen.getByRole("button", { name: "Love" }).click();
    expect(onRate).toHaveBeenCalledWith("LOVE");
  });
});
