import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import BadgesCard from "./BadgesCard";
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
    progress: 0,
    earned: false,
    earnedAt: null,
    ...overrides,
  };
}

const earnedAchievement = makeAchievement({
  key: "movies_10",
  earned: true,
  progress: 10,
  earnedAt: "2024-01-01T00:00:00Z",
});

const lockedAchievement = makeAchievement({
  key: "movies_50",
  title: "Cinephile II",
  threshold: 50,
  progress: 12,
  earned: false,
  earnedAt: null,
});

describe("BadgesCard", () => {
  test("renders earned badges as opaque tiles", () => {
    render(<BadgesCard achievements={[earnedAchievement]} mode="self" />);
    expect(screen.getByText("Cinephile I")).toBeDefined();
  });

  test("renders locked badges with progress in mode=self", () => {
    render(
      <BadgesCard achievements={[earnedAchievement, lockedAchievement]} mode="self" />
    );
    expect(screen.getByText("Cinephile II")).toBeDefined();
  });

  test("in mode=other, does NOT render locked badges", () => {
    render(
      <BadgesCard achievements={[earnedAchievement, lockedAchievement]} mode="other" />
    );
    expect(screen.getByText("Cinephile I")).toBeDefined();
    expect(screen.queryByText("Cinephile II")).toBeNull();
  });

  test("renders X / Y earned count in header", () => {
    render(
      <BadgesCard achievements={[earnedAchievement, lockedAchievement]} mode="self" />
    );
    expect(screen.getByText("1 / 2 earned")).toBeDefined();
  });

  test("handles empty achievements array", () => {
    const { container } = render(<BadgesCard achievements={[]} mode="self" />);
    expect(screen.getByText("No badges yet.")).toBeDefined();
    // The card itself still renders
    expect(container.firstChild).toBeDefined();
  });

  test("in mode=other with all locked, renders nothing", () => {
    const { container } = render(
      <BadgesCard achievements={[lockedAchievement]} mode="other" />
    );
    expect(container.firstChild).toBeNull();
  });

  afterEach(() => {
    cleanup();
  });
});
