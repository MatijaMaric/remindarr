import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import StreakCounter from "./StreakCounter";
import type { StreakData } from "../../types";

function makeStreak(overrides: Partial<StreakData> = {}): StreakData {
  return {
    currentStreak: 5,
    longestStreak: 10,
    lastWatchDate: "2024-01-10",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("StreakCounter", () => {
  test("renders current streak number", () => {
    render(
      <StreakCounter
        streak={makeStreak({ currentStreak: 7 })}
        variant="sidebar"
      />,
    );
    expect(screen.getByText("7")).toBeDefined();
  });

  test("renders longest streak in sidebar variant", () => {
    render(
      <StreakCounter
        streak={makeStreak({ longestStreak: 42 })}
        variant="sidebar"
      />,
    );
    expect(screen.getByText(/42 days/)).toBeDefined();
  });

  test("shows 0 streak gracefully", () => {
    render(
      <StreakCounter
        streak={makeStreak({ currentStreak: 0, longestStreak: 0 })}
        variant="inline"
      />,
    );
    expect(screen.getByText("0")).toBeDefined();
  });

  test("sidebar variant renders DossierCard shell with Streak kicker", () => {
    const { container } = render(
      <StreakCounter streak={makeStreak()} variant="sidebar" />,
    );
    expect(screen.getByText("Streak")).toBeDefined();
    // DossierCard renders a card element
    expect(container.querySelector("[class*='p-4']")).toBeDefined();
  });

  test("inline variant does not render card shell", () => {
    render(<StreakCounter streak={makeStreak()} variant="inline" />);
    // No "Streak" kicker in inline mode
    expect(screen.queryByText("Streak")).toBeNull();
    // But still shows the streak number
    expect(screen.getByText("5")).toBeDefined();
  });

  test("home variant renders without DossierCard kicker", () => {
    render(
      <StreakCounter
        streak={makeStreak({ currentStreak: 3 })}
        variant="home"
      />,
    );
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.queryByText("Streak")).toBeNull();
  });
});
