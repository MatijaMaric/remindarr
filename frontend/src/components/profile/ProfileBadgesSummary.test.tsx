import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ProfileBadgesSummary from "./ProfileBadgesSummary";
import type { UserAchievement } from "../../types";

function makeAchievement(
  overrides: Partial<UserAchievement> = {},
): UserAchievement {
  return {
    key: "movies_10",
    kind: "count_movies",
    threshold: 10,
    points: 10,
    title: "Cinephile I",
    description: "Watch 10 movies",
    icon: "Film",
    category: "watching",
    tier: "ladder",
    repeatable: false,
    family: "cinephile",
    rungIndex: 0,
    progress: 0,
    earned: false,
    earnedAt: null,
    earnedCount: 0,
    lastEarnedAt: null,
    nextRung: null,
    rarity: null,
    ...overrides,
  };
}

function renderSummary(
  achievements: UserAchievement[],
  mode: "self" | "other" = "self",
  viewAllHref = "/achievements",
) {
  return render(
    <MemoryRouter>
      <ProfileBadgesSummary
        achievements={achievements}
        mode={mode}
        viewAllHref={viewAllHref}
      />
    </MemoryRouter>,
  );
}

const earned1 = makeAchievement({
  key: "movies_10",
  title: "Cinephile I",
  points: 10,
  earned: true,
  earnedAt: "2024-03-01T00:00:00Z",
  earnedCount: 1,
  progress: 10,
});

const earned2 = makeAchievement({
  key: "movies_50",
  title: "Cinephile II",
  points: 25,
  earned: true,
  earnedAt: "2024-04-01T00:00:00Z",
  earnedCount: 1,
  progress: 50,
  threshold: 50,
  rungIndex: 1,
});

const earned3 = makeAchievement({
  key: "movies_100",
  title: "Cinephile III",
  points: 50,
  earned: true,
  earnedAt: "2024-05-01T00:00:00Z",
  earnedCount: 1,
  progress: 100,
  threshold: 100,
  rungIndex: 2,
});

const locked = makeAchievement({
  key: "tv_10",
  title: "Binge Watcher I",
  points: 10,
  earned: false,
  earnedAt: null,
  earnedCount: 0,
  progress: 5,
});

describe("ProfileBadgesSummary", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders the Achievements kicker", () => {
    renderSummary([earned1]);
    expect(screen.getByText("Achievements")).toBeDefined();
  });

  test("shows N/M · X XP chip with correct counts", () => {
    renderSummary([earned1, earned2, locked]);
    // earned1.points=10, earned2.points=25 → totalXp=35; earned=2, total=3
    expect(screen.getByText("2/3 · 35 XP")).toBeDefined();
  });

  test("shows up to 3 earned badges sorted by earnedAt desc", () => {
    // earned3 is most recent (2024-05-01), then earned2 (2024-04-01), then earned1 (2024-03-01)
    renderSummary([earned1, earned2, earned3]);
    const tiles = screen.getAllByRole("link");
    // The 3 badge tiles + the view all link
    // Filter out the view all link (it has text content)
    const badgeTiles = tiles.filter(
      (el) => !el.textContent?.includes("View all"),
    );
    expect(badgeTiles).toHaveLength(3);
    // First tile should be the most recently earned (earned3 — Cinephile III)
    expect(screen.getByText("Cinephile III")).toBeDefined();
    expect(screen.getByText("Cinephile II")).toBeDefined();
    expect(screen.getByText("Cinephile I")).toBeDefined();
  });

  test("shows the View all link with correct href", () => {
    renderSummary([earned1], "self", "/achievements");
    const link = screen.getByText("View all achievements →");
    expect(link).toBeDefined();
    expect(link.closest("a")?.getAttribute("href")).toBe("/achievements");
  });

  test("shows View all link with other user href", () => {
    renderSummary([earned1], "other", "/u/alice/achievements");
    const link = screen.getByText("View all achievements →");
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "/u/alice/achievements",
    );
  });

  test("returns null when achievements array is empty", () => {
    const { container } = renderSummary([]);
    expect(container.firstChild).toBeNull();
  });

  test("returns null when mode=other and no badges are earned", () => {
    const { container } = renderSummary([locked], "other");
    expect(container.firstChild).toBeNull();
  });

  test("renders card (not null) when mode=other and some badges are earned", () => {
    const { container } = renderSummary([earned1, locked], "other");
    expect(container.firstChild).not.toBeNull();
  });

  test("shows only up to 3 tiles even with more earned badges", () => {
    const extra = makeAchievement({
      key: "social_1",
      title: "Social Butterfly",
      points: 5,
      earned: true,
      earnedAt: "2024-01-01T00:00:00Z",
      earnedCount: 1,
      progress: 1,
    });
    renderSummary([earned1, earned2, earned3, extra]);
    // 4 earned, but only top 3 shown → earned3, earned2, earned1 by earnedAt desc
    // "Social Butterfly" earned earliest (2024-01-01) so it should NOT appear
    expect(screen.queryByText("Social Butterfly")).toBeNull();
    expect(screen.getByText("Cinephile III")).toBeDefined();
  });
});
