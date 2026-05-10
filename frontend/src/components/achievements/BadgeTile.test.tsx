import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BadgeTile } from "./BadgeTile";
import type { UserAchievement } from "../../types";

function makeAchievement(overrides: Partial<UserAchievement> = {}): UserAchievement {
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

function renderTile(achievement: UserAchievement, mode: "self" | "other" = "self") {
  return render(
    <MemoryRouter>
      <BadgeTile achievement={achievement} mode={mode} />
    </MemoryRouter>
  );
}

describe("BadgeTile", () => {
  afterEach(() => {
    cleanup();
  });

  test("earned tile renders tier ring class for bronze (rungIndex=0)", () => {
    const { container } = renderTile(
      makeAchievement({ earned: true, earnedAt: "2024-01-01T00:00:00Z", earnedCount: 1, progress: 10 })
    );
    // rungIndex=0 → bronze → ring-2 ring-amber-700/40
    const link = container.querySelector("a");
    expect(link).toBeDefined();
    expect(link?.className).toContain("ring-2");
    expect(link?.className).toContain("ring-amber-700/40");
  });

  test("locked tile in mode=self renders at 60% opacity", () => {
    const { container } = renderTile(
      makeAchievement({ earned: false, progress: 5 }),
      "self"
    );
    const link = container.querySelector("a");
    expect(link).toBeDefined();
    expect(link?.className).toContain("opacity-60");
  });

  test("locked tile in mode=other renders nothing", () => {
    const { container } = renderTile(
      makeAchievement({ earned: false, progress: 0 }),
      "other"
    );
    expect(container.firstChild).toBeNull();
  });

  test("earnedCount > 1 shows a count chip with ×2", () => {
    renderTile(
      makeAchievement({
        earned: true,
        earnedAt: "2024-01-01T00:00:00Z",
        earnedCount: 2,
        progress: 10,
      })
    );
    expect(screen.getByText("×2")).toBeDefined();
  });
});
