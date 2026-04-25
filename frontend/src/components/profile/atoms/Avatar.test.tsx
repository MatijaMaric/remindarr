import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { Avatar } from "./Avatar";

afterEach(() => cleanup());

describe("Avatar", () => {
  it("derives a deterministic hue from the username", () => {
    const { rerender } = render(<Avatar username="matija" />);
    const first = screen.getByTestId("avatar").getAttribute("data-hue");
    rerender(<Avatar username="matija" />);
    const second = screen.getByTestId("avatar").getAttribute("data-hue");
    expect(first).toBe(second);
  });

  it("different usernames produce different hues", () => {
    render(<Avatar username="alice" />);
    const aliceHue = screen.getByTestId("avatar").getAttribute("data-hue");
    cleanup();
    render(<Avatar username="bob" />);
    const bobHue = screen.getByTestId("avatar").getAttribute("data-hue");
    expect(aliceHue).not.toBe(bobHue);
  });

  it("renders initials from display name first", () => {
    render(<Avatar username="matija" displayName="Matija Maric" />);
    expect(screen.getByTestId("avatar").textContent).toBe("MM");
  });

  it("falls back to username initials when no display name", () => {
    render(<Avatar username="ana" />);
    expect(screen.getByTestId("avatar").textContent).toBe("AN");
  });

  it("renders an image when provided instead of initials", () => {
    const { container } = render(
      <Avatar username="matija" image="/avatar.png" displayName="Matija" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/avatar.png");
    expect(img!.getAttribute("alt")).toBe("Matija");
  });

  it("applies the requested size", () => {
    render(<Avatar username="matija" size={80} />);
    const avatar = screen.getByTestId("avatar");
    expect(avatar.style.width).toBe("80px");
    expect(avatar.style.height).toBe("80px");
  });
});
