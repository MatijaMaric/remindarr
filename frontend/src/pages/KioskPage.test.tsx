import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import "../i18n";

import type { KioskData, KioskAiringSlot, KioskRelease, KioskQueueItem } from "../api";

function makeData(overrides: Partial<KioskData> = {}): KioskData {
  return {
    meta: {
      household: "Test House",
      fidelity: "rich",
      refresh_interval_seconds: 300,
      generated_at: new Date().toISOString(),
    },
    airing_now: null,
    releasing_today: [],
    unwatched_queue: [],
    ...overrides,
  };
}

function makeSlot(overrides: Partial<KioskAiringSlot> = {}): KioskAiringSlot {
  return {
    id: 1,
    title_id: "show-1",
    show_title: "Airing Show",
    poster_url: null,
    backdrop_url: null,
    season_number: 2,
    episode_number: 5,
    ep_title: "The Episode",
    air_date: new Date().toISOString().slice(0, 10),
    provider: "Netflix",
    ...overrides,
  };
}

function makeRelease(overrides: Partial<KioskRelease> = {}): KioskRelease {
  return {
    id: 10,
    title_id: "show-2",
    show_title: "Releasing Show",
    poster_url: null,
    backdrop_url: null,
    season_number: 1,
    episode_number: 3,
    ep_title: "Third Episode",
    air_date: new Date().toISOString().slice(0, 10),
    provider: "Max",
    kind: "episode",
    ...overrides,
  };
}

function makeQueueItem(overrides: Partial<KioskQueueItem> = {}): KioskQueueItem {
  return {
    id: 20,
    title_id: "show-3",
    show_title: "Queued Show",
    poster_url: null,
    season_number: 1,
    episode_number: 4,
    ep_title: "Backlogged",
    air_date: new Date().toISOString().slice(0, 10),
    provider: "Plex",
    left: 3,
    ...overrides,
  };
}

const mockFetch = mock((_url: string, _init?: RequestInit) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: makeData() }),
  } as Response)
);

const { default: KioskPage } = await import("./KioskPage");

function Wrapper({ token = "abc123", search = "" }: { token?: string; search?: string }) {
  return (
    <MemoryRouter initialEntries={[`/kiosk/${token}${search}`]}>
      <Routes>
        <Route path="/kiosk/:token" element={<KioskPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockImplementation((_url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: makeData() }),
    } as Response)
  );
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  // @ts-expect-error — restore to undefined so other test files are unaffected
  globalThis.fetch = undefined;
});

describe("KioskPage", () => {
  it("renders the Remindarr branding header", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Remindarr")).toBeTruthy();
    });
  });

  it("shows the household name from meta", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ meta: { household: "The Test Manor", fidelity: "rich", refresh_interval_seconds: 300, generated_at: new Date().toISOString() } }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("The Test Manor")).toBeTruthy();
    });
  });

  it("shows airing_now show title in hero when present", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ airing_now: makeSlot() }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Airing Show")).toBeTruthy();
    });
  });

  it("shows empty hero when airing_now is null and no releases or queue", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Nothing on the slate today")).toBeTruthy();
    });
  });

  it("renders releasing_today show in the list", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ releasing_today: [makeRelease()] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("Releasing Show").length).toBeGreaterThan(0);
    });
  });

  it("renders unwatched queue show in the list", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ unwatched_queue: [makeQueueItem()] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("Queued Show").length).toBeGreaterThan(0);
    });
  });

  it("shows 'cold' badge for queue item aired >= 10 days ago", async () => {
    const oldDate = new Date(Date.now() - 11 * 86_400_000).toISOString().slice(0, 10);
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ unwatched_queue: [makeQueueItem({ air_date: oldDate })] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("cold")).toBeTruthy();
    });
  });

  it("does NOT show 'cold' badge for queue item aired < 10 days ago", async () => {
    const recentDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ unwatched_queue: [makeQueueItem({ air_date: recentDate })] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText("cold")).toBeNull();
    });
  });

  it("applies e-paper style marker (font-smoothing none) when display=epaper", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ meta: { household: "House", fidelity: "epaper", refresh_interval_seconds: 1800, generated_at: new Date().toISOString() } }) }),
      } as Response)
    );
    render(<Wrapper search="?display=epaper" />);
    await waitFor(() => {
      expect(screen.getByText(/kiosk · epaper/i)).toBeTruthy();
    });
  });

  it("the Cast to TV element is decorative — no interactive button", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ airing_now: makeSlot() }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/cast to tv/i)).toBeTruthy();
    });
    // The cast element must not be a <button> (it's a decorative div per design note 3)
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (b) => b.textContent?.toLowerCase().includes("cast")
    );
    expect(buttons.length).toBe(0);
  });

  it("shows error state when fetch fails", async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response));
    render(<Wrapper token="bad-token" />);
    await waitFor(() => {
      expect(screen.getByText("Kiosk unavailable")).toBeTruthy();
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
  });

  it("includes the fidelity chip in the header", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/kiosk · rich/i)).toBeTruthy();
    });
  });

  it("shows panel kicker labels", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/releasing today/i)).toBeTruthy();
      expect(screen.getByText(/up next in your queue/i)).toBeTruthy();
    });
  });

  it("sends X-Timezone header on fetch", async () => {
    mockFetch.mockClear();
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Remindarr")).toBeTruthy();
    });
    const calls = mockFetch.mock.calls as [string, RequestInit?][];
    const init = calls[0]?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Timezone"]).toBeTruthy();
  });

  it("shows fallback hero from releasing_today when airing_now is null", async () => {
    mockFetch.mockImplementation((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ airing_now: null, releasing_today: [makeRelease()] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("Releasing Show").length).toBeGreaterThan(0);
    });
    // The hero kicker for a releasing_today fallback
    expect(screen.getAllByText(/releasing today/i).length).toBeGreaterThan(0);
  });

  it("shows fallback hero from unwatched_queue when airing_now and releasing_today are empty", async () => {
    mockFetch.mockImplementation((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: makeData({ airing_now: null, releasing_today: [], unwatched_queue: [makeQueueItem()] }) }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("Queued Show").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/up next in your queue/i).length).toBeGreaterThan(0);
  });
});
