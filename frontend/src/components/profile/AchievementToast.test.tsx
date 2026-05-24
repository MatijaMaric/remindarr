import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { UserAchievement } from "../../types";
import * as api from "../../api";

import { useNewAchievements, ToastItem } from "./AchievementToast";
import AchievementToast from "./AchievementToast";

// ---- localStorage helper -------------------------------------------------------
// Bun's happy-dom localStorage is a native binding; spyOn cannot intercept it.
// We replace the global with a plain-object mock so spyOn/mockReturnValue works.

const storedData: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string): string | null => storedData[key] ?? null,
  setItem: (key: string, value: string): void => {
    storedData[key] = value;
  },
  removeItem: (key: string): void => {
    delete storedData[key];
  },
  clear: (): void => {
    for (const k of Object.keys(storedData)) delete storedData[k];
  },
  get length() {
    return Object.keys(storedData).length;
  },
  key: (_index: number): string | null => null,
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// ---- factories -----------------------------------------------------------------

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
    progress: 10,
    earned: true,
    earnedAt: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

// Helper: flush the initial setTimeout(0) + promise resolution used by the hook
async function flushHookTimers() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

// ---- useNewAchievements hook ---------------------------------------------------

describe("useNewAchievements", () => {
  let spy: ReturnType<typeof spyOn<typeof api, "getMyAchievements">>;

  beforeEach(() => {
    spy = spyOn(api, "getMyAchievements").mockResolvedValue([]);
    localStorageMock.clear();
  });

  afterEach(() => {
    spy.mockRestore();
    cleanup();
  });

  it("surfaces all earned achievements when localStorage has no lastSeenAchievementAt", async () => {
    const achievement = makeAchievement();
    spy.mockResolvedValue([achievement]);
    // localStorage is cleared — no lastSeenAchievementAt stored

    const { result } = renderHook(() => useNewAchievements());
    await flushHookTimers();

    expect(result.current).toHaveLength(1);
    expect(result.current[0].key).toBe("movies_10");
  });

  it("surfaces only achievements earned after lastSeenAchievementAt", async () => {
    const oldDate = "2025-01-01T00:00:00Z";
    const newDate = "2026-06-01T00:00:00Z";
    const oldAchievement = makeAchievement({
      key: "movies_10",
      earnedAt: oldDate,
    });
    const newAchievement = makeAchievement({
      key: "movies_50",
      title: "Cinephile II",
      earnedAt: newDate,
    });

    spy.mockResolvedValue([oldAchievement, newAchievement]);
    // Set lastSeenAchievementAt between the two earnedAt dates
    localStorageMock.setItem("lastSeenAchievementAt", "2026-01-01T00:00:00Z");

    const { result } = renderHook(() => useNewAchievements());
    await flushHookTimers();

    expect(result.current).toHaveLength(1);
    expect(result.current[0].key).toBe("movies_50");
  });

  it("returns empty array when all achievements are older than lastSeenAchievementAt", async () => {
    const achievement = makeAchievement({ earnedAt: "2024-01-01T00:00:00Z" });
    spy.mockResolvedValue([achievement]);
    // lastSeenAchievementAt is newer than earnedAt
    localStorageMock.setItem("lastSeenAchievementAt", "2026-01-01T00:00:00Z");

    const { result } = renderHook(() => useNewAchievements());
    await flushHookTimers();

    expect(result.current).toHaveLength(0);
  });

  it("updates localStorage.lastSeenAchievementAt after surfacing new achievements", async () => {
    const achievement = makeAchievement();
    spy.mockResolvedValue([achievement]);
    // No lastSeenAchievementAt stored

    renderHook(() => useNewAchievements());
    await flushHookTimers();

    const stored = localStorageMock.getItem("lastSeenAchievementAt");
    expect(stored).not.toBeNull();
    expect(typeof stored).toBe("string");
    // Should be a valid ISO date
    expect(new Date(stored!).toString()).not.toBe("Invalid Date");
  });

  it("does not update localStorage when no new achievements are found", async () => {
    const achievement = makeAchievement({ earnedAt: "2024-01-01T00:00:00Z" });
    spy.mockResolvedValue([achievement]);
    localStorageMock.setItem("lastSeenAchievementAt", "2026-01-01T00:00:00Z");

    // Track calls manually via the mock storage
    const before = localStorageMock.getItem("lastSeenAchievementAt");

    renderHook(() => useNewAchievements());
    await flushHookTimers();

    // The stored value should remain unchanged (not updated to a newer timestamp)
    const after = localStorageMock.getItem("lastSeenAchievementAt");
    expect(after).toBe(before);
  });
});

// ---- AchievementToast component -----------------------------------------------

describe("AchievementToast", () => {
  let spy: ReturnType<typeof spyOn<typeof api, "getMyAchievements">>;

  beforeEach(() => {
    spy = spyOn(api, "getMyAchievements").mockResolvedValue([]);
    localStorageMock.clear();
  });

  afterEach(() => {
    spy.mockRestore();
    cleanup();
  });

  it("renders a toast for each new achievement", async () => {
    const a1 = makeAchievement({ key: "movies_10", title: "Cinephile I" });
    const a2 = makeAchievement({ key: "movies_50", title: "Cinephile II" });
    spy.mockResolvedValue([a1, a2]);

    render(<AchievementToast />);
    await flushHookTimers();

    expect(screen.getByText("Cinephile I")).toBeDefined();
    expect(screen.getByText("Cinephile II")).toBeDefined();
  });

  it("shows 'Achievement unlocked' label in each toast", async () => {
    const achievement = makeAchievement({ title: "Cinephile I" });
    spy.mockResolvedValue([achievement]);

    render(<AchievementToast />);
    await flushHookTimers();

    const labels = screen.getAllByText("Achievement unlocked");
    expect(labels.length).toBeGreaterThan(0);
  });

  it("shows achievement title in the toast", async () => {
    const achievement = makeAchievement({
      key: "movies_10",
      title: "Cinephile I",
    });
    spy.mockResolvedValue([achievement]);

    render(<AchievementToast />);
    await flushHookTimers();

    expect(screen.getByText("Cinephile I")).toBeDefined();
  });

  it("renders nothing when there are no new achievements", async () => {
    spy.mockResolvedValue([]);

    const { container } = render(<AchievementToast />);
    await flushHookTimers();

    // The root fixed container should not be in the DOM when there are no toasts
    expect(container.firstChild).toBeNull();
  });

  it("renders alert roles for accessibility", async () => {
    const achievement = makeAchievement({ title: "Cinephile I" });
    spy.mockResolvedValue([achievement]);

    render(<AchievementToast />);
    await flushHookTimers();

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });
});

// ---- ToastItem dismiss button --------------------------------------------------

describe("ToastItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the achievement title and dismiss button", () => {
    const onDismiss = mock(() => {});
    render(
      <ToastItem
        achievement={makeAchievement({ title: "Movie Buff" })}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("Movie Buff")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /dismiss achievement notification/i }),
    ).toBeTruthy();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = mock(() => {});
    render(
      <ToastItem
        achievement={makeAchievement({ title: "Movie Buff" })}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss achievement notification/i }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
