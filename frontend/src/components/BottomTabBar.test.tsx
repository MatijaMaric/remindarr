import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n
import "../i18n";

// Mock the API module before importing BottomTabBar
mock.module("../api", () => ({
  getUnreadRecommendationCount: mock(() => Promise.resolve({ count: 0 })),
}));

import BottomTabBar from "./BottomTabBar";
import { AuthContext } from "../context/AuthContext";

const mockUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return (
    <MemoryRouter>
      <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe("BottomTabBar", () => {
  it("renders 5 tabs when user is authenticated", () => {
    render(<BottomTabBar />, { wrapper: Wrapper });

    expect(screen.getByText("Watch")).toBeDefined();
    expect(screen.getByText("Upcoming")).toBeDefined();
    expect(screen.getByText("Discovery")).toBeDefined();
    expect(screen.getByText("Browse")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
  });

  it("renders Browse and Sign In when user is not authenticated", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    render(
      <MemoryRouter>
        <AuthContext value={noUserAuth as any}>
          <BottomTabBar />
        </AuthContext>
      </MemoryRouter>
    );

    expect(screen.getByText("Browse")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.queryByText("Watch")).toBeNull();
    expect(screen.queryByText("Upcoming")).toBeNull();
    expect(screen.queryByText("Discovery")).toBeNull();
    expect(screen.queryByText("Profile")).toBeNull();
  });

  it("renders nothing while auth is loading", () => {
    const loadingAuth = { ...mockAuthValue, loading: true };
    const { container } = render(
      <MemoryRouter>
        <AuthContext value={loadingAuth as any}>
          <BottomTabBar />
        </AuthContext>
      </MemoryRouter>
    );

    expect(container.innerHTML).toBe("");
  });

  it("has sm:hidden class for mobile-only display", () => {
    const { container } = render(<BottomTabBar />, { wrapper: Wrapper });
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("sm:hidden");
  });

  it("links to correct routes when authenticated", () => {
    render(<BottomTabBar />, { wrapper: Wrapper });

    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/reels");
    expect(hrefs).toContain("/upcoming");
    expect(hrefs).toContain("/discovery");
    expect(hrefs).toContain("/browse");
    expect(hrefs).toContain("/user/test");
  });

  it("links to correct routes when not authenticated", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    render(
      <MemoryRouter>
        <AuthContext value={noUserAuth as any}>
          <BottomTabBar />
        </AuthContext>
      </MemoryRouter>
    );

    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/browse");
    expect(hrefs).toContain("/login");
  });

  it("nav has accessible label", () => {
    render(<BottomTabBar />, { wrapper: Wrapper });
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeDefined();
  });
});
