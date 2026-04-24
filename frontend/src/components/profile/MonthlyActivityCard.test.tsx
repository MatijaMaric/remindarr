import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import "../../i18n";
import MonthlyActivityCard from "./MonthlyActivityCard";
import type { ProfileMonthlyActivity } from "../../types";

afterEach(() => cleanup());

function fixture(overrides: Partial<ProfileMonthlyActivity>[] = []): ProfileMonthlyActivity[] {
  const base: ProfileMonthlyActivity[] = [
    { month: "2025-05", movies_watched: 4, episodes_watched: 28 },
    { month: "2025-06", movies_watched: 6, episodes_watched: 42 },
    { month: "2025-07", movies_watched: 9, episodes_watched: 61 },
  ];
  return base.map((b, i) => ({ ...b, ...overrides[i] }));
}

describe("MonthlyActivityCard", () => {
  it("renders the 12m kicker and total line", () => {
    render(<MonthlyActivityCard monthly={fixture()} />);
    expect(screen.getByText("12-month activity")).toBeDefined();
    // 4+6+9=19 movies, 28+42+61=131 episodes
    expect(screen.getByText(/131 episodes · 19 movies/)).toBeDefined();
  });

  it("renders one bar column per month", () => {
    const monthly = fixture();
    render(<MonthlyActivityCard monthly={monthly} />);
    const bars = screen.getByTestId("monthly-bars");
    expect(bars.children.length).toBe(monthly.length);
  });

  it("returns null when monthly is empty", () => {
    const { container } = render(<MonthlyActivityCard monthly={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("handles months with zero activity without NaN", () => {
    const monthly: ProfileMonthlyActivity[] = [
      { month: "2025-05", movies_watched: 0, episodes_watched: 0 },
      { month: "2025-06", movies_watched: 5, episodes_watched: 10 },
    ];
    render(<MonthlyActivityCard monthly={monthly} />);
    expect(screen.getByText(/10 episodes · 5 movies/)).toBeDefined();
  });
});
