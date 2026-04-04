import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotFoundPage from "./NotFoundPage";

afterEach(() => {
  cleanup();
});

describe("NotFoundPage", () => {
  it("renders a 404 heading", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("404")).toBeDefined();
  });

  it("renders 'Page not found' text", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const heading = screen.getByText("Page not found");
    expect(heading).toBeDefined();
  });

  it("renders a link back to home", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Go back home" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/");
  });
});
