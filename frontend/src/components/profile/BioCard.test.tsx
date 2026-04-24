import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "../../i18n";
import BioCard from "./BioCard";

afterEach(() => cleanup());

describe("BioCard", () => {
  it("renders the bio text when provided", () => {
    render(<BioCard bio="Tracking 42 shows." isOwnProfile={false} />);
    expect(screen.getByTestId("bio-text").textContent).toBe("Tracking 42 shows.");
  });

  it("shows empty placeholder for visitors when bio is null", () => {
    render(<BioCard bio={null} isOwnProfile={false} />);
    expect(screen.getByTestId("bio-text").textContent).toBe("No bio yet.");
  });

  it("shows own-profile placeholder when user is viewing their own empty bio", () => {
    render(<BioCard bio={null} isOwnProfile={true} />);
    expect(screen.getByTestId("bio-text").textContent).toMatch(/Add a short bio/);
  });

  it("shows edit button only for own profile", () => {
    const { rerender } = render(<BioCard bio="hi" isOwnProfile={false} />);
    expect(screen.queryByTestId("bio-edit")).toBeNull();
    rerender(<BioCard bio="hi" isOwnProfile={true} />);
    expect(screen.queryByTestId("bio-edit")).not.toBeNull();
  });

  it("opens the edit modal when edit is clicked", () => {
    render(<BioCard bio="hi" isOwnProfile={true} />);
    fireEvent.click(screen.getByTestId("bio-edit"));
    expect(screen.queryByTestId("edit-bio-modal")).not.toBeNull();
  });
});
