import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n";
import PrivacyPolicyPage from "./PrivacyPolicyPage";

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  );
}

describe("PrivacyPolicyPage", () => {
  it("renders the page title", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Privacy Policy/i, level: 1 }),
    ).toBeDefined();
  });

  it("renders representative sections", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Information we collect/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: /Third-party data and services/i }),
    ).toBeDefined();
  });

  it("links to the terms of service", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Terms of Service/i });
    expect(link.getAttribute("href")).toBe("/terms");
  });
});
