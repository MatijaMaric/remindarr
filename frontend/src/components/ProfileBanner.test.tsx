import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n";
import ProfileBanner from "./ProfileBanner";
import type { ProfileBackdrop, UserProfileUser, UserProfileStats } from "../types";

afterEach(cleanup);

const mockUser: UserProfileUser = {
  username: "testuser",
  display_name: "Test User",
  image: null,
  member_since: "2024-01-15T00:00:00Z",
};

const mockStats: UserProfileStats = {
  tracked_count: 12,
  watched_movies: 5,
  watched_episodes: 42,
};

function renderBanner(
  overrides: {
    backdrops?: ProfileBackdrop[];
    user?: UserProfileUser;
    stats?: UserProfileStats;
    isOwnProfile?: boolean;
    autoAdvanceMs?: number;
  } = {},
) {
  return render(
    <MemoryRouter>
      <ProfileBanner
        backdrops={overrides.backdrops ?? []}
        user={overrides.user ?? mockUser}
        stats={overrides.stats ?? mockStats}
        isOwnProfile={overrides.isOwnProfile ?? false}
        autoAdvanceMs={overrides.autoAdvanceMs}
      />
    </MemoryRouter>,
  );
}

describe("ProfileBanner", () => {
  describe("fallback", () => {
    it("shows a dark gradient background when no backdrops", () => {
      renderBanner({ backdrops: [] });
      expect(screen.getByTestId("fallback-bg")).toBeDefined();
    });

    it("still renders user info with no backdrops", () => {
      renderBanner({ backdrops: [] });
      expect(screen.getByText("Test User")).toBeDefined();
    });
  });

  describe("user info overlay", () => {
    it("renders display name", () => {
      renderBanner();
      expect(screen.getByText("Test User")).toBeDefined();
    });

    it("renders @username when display_name differs from username", () => {
      renderBanner();
      expect(screen.getByText("@testuser")).toBeDefined();
    });

    it("does not render @username when display_name matches username", () => {
      renderBanner({
        user: { ...mockUser, display_name: "testuser" },
      });
      expect(screen.queryByText("@testuser")).toBeNull();
    });

    it("does not render @username when display_name is null", () => {
      renderBanner({
        user: { ...mockUser, display_name: null },
      });
      // Falls back to showing username as display name
      expect(screen.getByText("testuser")).toBeDefined();
      expect(screen.queryByText("@testuser")).toBeNull();
    });

    it("renders member since date", () => {
      renderBanner();
      // The i18n key returns "Member since {{date}}" with interpolation
      const el = screen.getByText(/Member since/);
      expect(el).toBeDefined();
    });
  });

  describe("stats overlay", () => {
    it("renders tracked count", () => {
      renderBanner();
      const statsEl = screen.getByTestId("profile-stats");
      expect(statsEl.textContent).toContain("12");
    });

    it("renders watched movies count", () => {
      renderBanner();
      const statsEl = screen.getByTestId("profile-stats");
      expect(statsEl.textContent).toContain("5");
    });

    it("renders watched episodes count", () => {
      renderBanner();
      const statsEl = screen.getByTestId("profile-stats");
      expect(statsEl.textContent).toContain("42");
    });
  });

  describe("settings button", () => {
    it("shows settings link on own profile", () => {
      renderBanner({ isOwnProfile: true });
      expect(screen.getByTestId("settings-link")).toBeDefined();
    });

    it("hides settings link on other profiles", () => {
      renderBanner({ isOwnProfile: false });
      expect(screen.queryByTestId("settings-link")).toBeNull();
    });
  });

  describe("carousel", () => {
    const backdrops: ProfileBackdrop[] = [
      { id: "show-1", title: "Show One", backdrop_url: "https://example.com/1.jpg" },
      { id: "show-2", title: "Show Two", backdrop_url: "https://example.com/2.jpg" },
      { id: "show-3", title: "Show Three", backdrop_url: "https://example.com/3.jpg" },
    ];

    it("renders all backdrop images", () => {
      renderBanner({ backdrops });
      expect(screen.getByAltText("Show One")).toBeDefined();
      expect(screen.getByAltText("Show Two")).toBeDefined();
      expect(screen.getByAltText("Show Three")).toBeDefined();
    });

    it("only shows the first image initially (others have opacity 0)", () => {
      renderBanner({ backdrops });
      const img1 = screen.getByAltText("Show One").closest("a")!;
      const img2 = screen.getByAltText("Show Two").closest("a")!;
      expect(img1.style.opacity).toBe("1");
      expect(img2.style.opacity).toBe("0");
    });

    it("renders navigation dots for multiple backdrops", () => {
      renderBanner({ backdrops });
      const dots = screen.getByTestId("nav-dots");
      const buttons = dots.querySelectorAll("button");
      expect(buttons.length).toBe(3);
    });

    it("does not render navigation dots for a single backdrop", () => {
      renderBanner({ backdrops: [backdrops[0]] });
      expect(screen.queryByTestId("nav-dots")).toBeNull();
    });

    it("clicking a navigation dot changes active slide", () => {
      renderBanner({ backdrops });
      const dots = screen.getByTestId("nav-dots");
      const buttons = dots.querySelectorAll("button");

      // Click second dot
      fireEvent.click(buttons[1]);

      const img1 = screen.getByAltText("Show One").closest("a")!;
      const img2 = screen.getByAltText("Show Two").closest("a")!;
      expect(img1.style.opacity).toBe("0");
      expect(img2.style.opacity).toBe("1");
    });

    it("auto-advances after the configured interval", async () => {
      renderBanner({ backdrops, autoAdvanceMs: 100 });

      // Initially first slide is active
      const img1 = screen.getByAltText("Show One").closest("a")!;
      expect(img1.style.opacity).toBe("1");

      // Wait for auto-advance (100ms + buffer)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      // Second slide should now be active
      const img2 = screen.getByAltText("Show Two").closest("a")!;
      expect(img2.style.opacity).toBe("1");
      expect(img1.style.opacity).toBe("0");
    });

    it("links backdrop images to title detail pages", () => {
      renderBanner({ backdrops: [backdrops[0]] });
      const link = screen.getByAltText("Show One").closest("a")!;
      expect(link.getAttribute("href")).toBe("/title/show-1");
    });
  });
});
