import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import "../i18n";

import type { KioskData, KioskRelease, KioskQueueItem } from "../api";

function localDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeData(overrides: Partial<KioskData> = {}): KioskData {
  return {
    meta: {
      household: "Test House",
      fidelity: "rich",
      refresh_interval_seconds: 300,
      generated_at: new Date().toISOString(),
    },
    releasing_today: [],
    unwatched_queue: [],
    queue_total: overrides.unwatched_queue?.length ?? 0,
    ...overrides,
  };
}

function makeRelease(overrides: Partial<KioskRelease> = {}): KioskRelease {
  return {
    id: 10,
    title_id: "show-2",
    show_title: "Releasing Show",
    // A real path renders an <img>; null renders a stripe poster that repeats
    // the title as text and would double every getAllByText count.
    poster_url: "/release.jpg",
    backdrop_url: null,
    season_number: 1,
    episode_number: 3,
    ep_title: "Third Episode",
    air_date: localDate(),
    provider: "Max",
    kind: "episode",
    is_watched: false,
    ...overrides,
  };
}

function makeQueueItem(
  overrides: Partial<KioskQueueItem> = {},
): KioskQueueItem {
  return {
    id: 20,
    title_id: "show-3",
    show_title: "Queued Show",
    poster_url: "/queue.jpg",
    season_number: 1,
    episode_number: 4,
    ep_title: "Backlogged",
    air_date: localDate(3),
    provider: "Plex",
    left: 3,
    ...overrides,
  };
}

function respond(data: KioskData | null, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data ?? {}),
  } as Response);
}

const mockFetch = mock((_url: string, _init?: RequestInit) =>
  respond(makeData()),
);

function serve(data: KioskData) {
  mockFetch.mockImplementation(() => respond(data));
}

const { default: KioskPage } = await import("./KioskPage");

function Wrapper({
  token = "abc123",
  search = "",
}: {
  token?: string;
  search?: string;
}) {
  return (
    <MemoryRouter initialEntries={[`/kiosk/${token}${search}`]}>
      <Routes>
        <Route path="/kiosk/:token" element={<KioskPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  serve(makeData());
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  globalThis.fetch = originalFetch;
});

describe("KioskPage", () => {
  it("renders the Remindarr branding header", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Remindarr")).toBeTruthy();
    });
  });

  it("shows the household name from meta", async () => {
    serve(
      makeData({
        meta: {
          household: "The Test Manor",
          fidelity: "rich",
          refresh_interval_seconds: 300,
          generated_at: new Date().toISOString(),
        },
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("The Test Manor")).toBeTruthy();
    });
  });

  it("shows the empty hero and no panels when there is nothing", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Nothing on the slate today")).toBeTruthy();
    });
    expect(screen.queryByText("New today")).toBeNull();
    expect(screen.queryByText("Up next in your queue")).toBeNull();
  });

  it("leads with today's first unwatched episode and does not repeat it", async () => {
    serve(
      makeData({
        releasing_today: [
          makeRelease({ id: 1, show_title: "Seen Show", is_watched: true }),
          makeRelease({ id: 2, show_title: "Fresh Show" }),
        ],
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/new today · max/i)).toBeTruthy();
    });
    // Hero + one panel row, each show exactly once
    expect(screen.getAllByText("Fresh Show")).toHaveLength(1);
    expect(screen.getAllByText("Seen Show")).toHaveLength(1);
    // Total counts every episode today, including the hero
    expect(screen.getByText("2 episodes")).toBeTruthy();
  });

  it("hides the releases panel when the hero is the only episode today", async () => {
    serve(
      makeData({
        releasing_today: [makeRelease()],
        unwatched_queue: [makeQueueItem()],
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("Releasing Show")).toHaveLength(1);
    });
    expect(screen.queryByText("1 episode")).toBeNull();
    expect(screen.getByText("Up next in your queue")).toBeTruthy();
    expect(screen.getByText("1 show")).toBeTruthy();
  });

  it("falls back to the top of the queue and does not repeat it", async () => {
    serve(
      makeData({
        unwatched_queue: [
          makeQueueItem({ id: 1, show_title: "First Up" }),
          makeQueueItem({ id: 2, show_title: "Second Up" }),
        ],
        queue_total: 5,
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/^up next · plex$/i)).toBeTruthy();
    });
    expect(screen.getAllByText("First Up")).toHaveLength(1);
    expect(screen.getAllByText("Second Up")).toHaveLength(1);
    expect(screen.getByText("5 shows")).toBeTruthy();
    expect(screen.queryByText("New today")).toBeNull();
  });

  it("tags only premieres", async () => {
    serve(
      makeData({
        releasing_today: [
          makeRelease({ id: 1, show_title: "Hero Show" }),
          makeRelease({ id: 2, show_title: "Pilot Show", kind: "premiere" }),
          makeRelease({ id: 3, show_title: "Plain Show" }),
        ],
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("premiere")).toBeTruthy();
    });
    expect(screen.getAllByText("premiere")).toHaveLength(1);
    expect(screen.queryByText("episode")).toBeNull();
  });

  it("labels the air date in calendar days, not '1d ago' for today", async () => {
    serve(
      makeData({
        unwatched_queue: [
          makeQueueItem({ id: 1, show_title: "Hero" }),
          makeQueueItem({ id: 2, show_title: "Today", air_date: localDate(0) }),
          makeQueueItem({ id: 3, show_title: "Yday", air_date: localDate(1) }),
          makeQueueItem({ id: 4, show_title: "Old", air_date: localDate(11) }),
        ],
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/aired today/)).toBeTruthy();
    });
    expect(screen.getByText(/aired yesterday/)).toBeTruthy();
    expect(screen.getByText(/aired 11d ago/)).toBeTruthy();
    // Only the 11-day-old row is cold
    expect(screen.getAllByText("cold")).toHaveLength(1);
  });

  it("applies the e-paper style when display=epaper", async () => {
    const { container } = render(<Wrapper search="?display=epaper" />);
    await waitFor(() => {
      expect(screen.getByText(/auto-refreshes every 30 min/i)).toBeTruthy();
    });
    // happy-dom drops -webkit-font-smoothing; the cream e-paper background is
    // the other marker of this palette.
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("style")).toMatch(/f6f3e8|246, 243, 232/i);
  });

  it("has no Cast button, fidelity chip or token in the footer", async () => {
    serve(makeData({ releasing_today: [makeRelease()] }));
    render(<Wrapper token="secret-token" />);
    await waitFor(() => {
      expect(screen.getByText(/auto-refreshes every 5 min/i)).toBeTruthy();
    });
    expect(screen.queryByText(/cast to tv/i)).toBeNull();
    expect(screen.queryByText(/kiosk ·/i)).toBeNull();
    expect(document.body.textContent).not.toContain("secr");
  });

  it("shows 'link no longer valid' on a 401", async () => {
    mockFetch.mockImplementation(() => respond(null, 401));
    render(<Wrapper token="bad-token" />);
    await waitFor(() => {
      expect(screen.getByText("Kiosk unavailable")).toBeTruthy();
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
  });

  it("does not call a link invalid on a server error", async () => {
    mockFetch.mockImplementation(() => respond(null, 503));
    render(<Wrapper />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(screen.queryByText("Kiosk unavailable")).toBeNull();
    expect(screen.getByText("Remindarr")).toBeTruthy();
  });

  it("keeps the last good data when a later refresh fails", async () => {
    serve(makeData({ releasing_today: [makeRelease()] }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Releasing Show")).toBeTruthy();
    });

    mockFetch.mockImplementation(() => Promise.reject(new Error("offline")));
    const calls = mockFetch.mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(calls);
    });
    expect(screen.getByText("Releasing Show")).toBeTruthy();
    expect(screen.queryByText("Kiosk unavailable")).toBeNull();
  });

  it("sends X-Timezone header on fetch", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const calls = mockFetch.mock.calls as [string, RequestInit?][];
    const headers = calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.["X-Timezone"]).toBeTruthy();
  });
});
