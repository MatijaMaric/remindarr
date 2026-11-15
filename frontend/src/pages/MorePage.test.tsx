import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../i18n";
import * as api from "../api";
import { AuthContext } from "../context/AuthContext";
import MorePage from "./MorePage";

const mockAuth = {
  user: {
    id: "1",
    username: "alice",
    display_name: "Alice Smith",
    auth_provider: "local",
    is_admin: false,
  },
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

const originalMatchMedia = window.matchMedia;

/** Emulates a viewport `width` px wide for `(max-width: Npx)` queries. */
function setWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
    return {
      matches: width <= max,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderMore() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/more"]}>
        <AuthContext value={mockAuth as any}>
          <Routes>
            <Route path="/more" element={<MorePage />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let countSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  countSpy = spyOn(api, "getUnreadRecommendationCount").mockResolvedValue({
    count: 0,
  } as never);
});

afterEach(() => {
  cleanup();
  countSpy.mockRestore();
  window.matchMedia = originalMatchMedia;
});

describe("MorePage", () => {
  it("links to the profile once, through the profile card", () => {
    setWidth(375);
    renderMore();
    const profileLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/user/alice");
    expect(profileLinks).toHaveLength(1);
    expect(screen.queryByText("Profile")).toBeNull();
  });

  it("offers the dashboard instead of Reels on phones, where Home opens Reels", () => {
    setWidth(375);
    renderMore();
    const dashboard = screen.getByRole("link", { name: /Dashboard/ });
    expect(dashboard.getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: /Reels/ })).toBeNull();
  });

  it("offers Reels between 640 and 767px, where Home opens the dashboard", () => {
    setWidth(700);
    renderMore();
    expect(
      screen.getByRole("link", { name: /Reels/ }).getAttribute("href"),
    ).toBe("/reels");
    expect(screen.queryByRole("link", { name: /Dashboard/ })).toBeNull();
  });

  it("shows the unread recommendations count on the Discovery row", async () => {
    setWidth(375);
    countSpy.mockResolvedValue({ count: 3 } as never);
    renderMore();
    const discovery = await screen.findByRole("link", {
      name: /Discovery.*3 unread recommendations/,
    });
    expect(discovery.getAttribute("href")).toBe("/discovery");
    expect(screen.getByTestId("unread-badge").textContent).toBe("3");
  });

  it("uses the same sign-out label as the desktop nav", () => {
    setWidth(375);
    renderMore();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });

  it("sends desktop visitors to Home, not Reels", () => {
    setWidth(1280);
    renderMore();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
});
