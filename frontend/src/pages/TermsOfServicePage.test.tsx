import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n";
import TermsOfServicePage from "./TermsOfServicePage";

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsOfServicePage />
    </MemoryRouter>,
  );
}

describe("TermsOfServicePage", () => {
  it("renders the page title", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Terms of Service/i, level: 1 }),
    ).toBeDefined();
  });

  it("renders representative sections", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Acceptance of terms/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: /Acceptable use/i }),
    ).toBeDefined();
  });

  it("links to the privacy policy", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Privacy Policy/i });
    expect(link.getAttribute("href")).toBe("/privacy");
  });
});
