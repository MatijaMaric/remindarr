import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Initialize i18n
import "../i18n";

// Mock the API module before importing BottomTabBar
mock.module("../api", () => ({
  getUnreadRecommendationCount: mock(() => Promise.resolve({ count: 0 })),
}));

import BottomTabBar from "./BottomTabBar";
import { AuthContext } from "../context/AuthContext";

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

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
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>
        <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe("BottomTabBar", () => {
  it("renders 5 tabs when user is authenticated", () => {
    render(<BottomTabBar />, { wrapper: Wrapper });

    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("Browse")).toBeDefined();
    expect(screen.getByText("Calendar")).toBeDefined();
    expect(screen.getByText("Tracked")).toBeDefined();
    expect(screen.getByText("More")).toBeDefined();
  });

  it("renders Browse and Sign In when user is not authenticated", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter>
          <AuthContext value={noUserAuth as any}>
            <BottomTabBar />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Browse")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.queryByText("Tracked")).toBeNull();
    expect(screen.queryByText("More")).toBeNull();
  });

  it("renders nothing while auth is loading", () => {
    const loadingAuth = { ...mockAuthValue, loading: true };
    const { container } = render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter>
          <AuthContext value={loadingAuth as any}>
            <BottomTabBar />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>
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
    expect(hrefs).toContain("/browse");
    expect(hrefs).toContain("/calendar");
    expect(hrefs).toContain("/tracked");
    expect(hrefs).toContain("/more");
  });

  it("links to correct routes when not authenticated", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter>
          <AuthContext value={noUserAuth as any}>
            <BottomTabBar />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>
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

  it("More link has descriptive aria-label", () => {
    render(<BottomTabBar />, { wrapper: Wrapper });
    const moreLink = screen.getByRole("link", { name: "More navigation options" });
    expect(moreLink).toBeDefined();
    expect(moreLink.getAttribute("href")).toBe("/more");
  });
});
