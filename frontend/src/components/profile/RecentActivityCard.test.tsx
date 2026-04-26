import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import "../../i18n";
import RecentActivityCard from "./RecentActivityCard";
import type { ActivityEvent, ActivityFeedResponse } from "../../types";

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function event(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: "rt:movie-1",
    type: "rating_title",
    created_at: "2026-04-26T10:00:00Z",
    title: { id: "movie-1", title: "Halcyon Drift", object_type: "MOVIE", poster_url: null, runtime_minutes: 120 },
    rating: "LOVE",
    ...overrides,
  };
}

function makeFetcher(pages: ActivityFeedResponse[]) {
  const calls: { username: string; before?: string; limit?: number }[] = [];
  const queue = [...pages];
  const fetcher = async (username: string, options: { limit?: number; before?: string }) => {
    calls.push({ username, ...options });
    return queue.shift() ?? { activities: [], has_more: false, next_cursor: null };
  };
  return { fetcher, calls };
}

afterEach(() => cleanup());

describe("RecentActivityCard", () => {
  it("renders the section header", async () => {
    const { fetcher } = makeFetcher([{ activities: [], has_more: false, next_cursor: null }]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Recent activity")).toBeDefined());
  });

  it("renders an empty state when there are no events", async () => {
    const { fetcher } = makeFetcher([{ activities: [], has_more: false, next_cursor: null }]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Nothing here yet.")).toBeDefined());
  });

  it("renders a rating event with the title and badge", async () => {
    const { fetcher } = makeFetcher([
      { activities: [event({ id: "rt:movie-1" })], has_more: false, next_cursor: null },
    ]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Halcyon Drift")).toBeDefined());
    expect(screen.getByText("Rating")).toBeDefined();
  });

  it("renders the review text on episode rating events with reviews", async () => {
    const { fetcher } = makeFetcher([
      {
        activities: [
          event({
            id: "re:42",
            type: "rating_episode",
            episode: { id: 42, season_number: 2, episode_number: 3, name: "The Lantern Ghost" },
            rating: "LOVE",
            review: "Best of the season.",
          }),
        ],
        has_more: false,
        next_cursor: null,
      },
    ]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText(/Best of the season\./)).toBeDefined());
    expect(screen.getByText("Review")).toBeDefined();
  });

  it("renders Load more and fetches the next page when clicked", async () => {
    const { fetcher, calls } = makeFetcher([
      {
        activities: [event({ id: "rt:m1", title: { id: "m1", title: "First", object_type: "MOVIE", poster_url: null, runtime_minutes: null } })],
        has_more: true,
        next_cursor: "2026-04-25T00:00:00Z",
      },
      {
        activities: [event({ id: "rt:m2", title: { id: "m2", title: "Second", object_type: "MOVIE", poster_url: null, runtime_minutes: null } })],
        has_more: false,
        next_cursor: null,
      },
    ]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("First")).toBeDefined());

    const button = screen.getByRole("button", { name: /Load more/ });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Second")).toBeDefined());
    expect(calls).toHaveLength(2);
    expect(calls[1].before).toBe("2026-04-25T00:00:00Z");
  });

  it("renders the recommendation message in italic when present", async () => {
    const { fetcher } = makeFetcher([
      {
        activities: [
          event({
            id: "rec:abc",
            type: "recommendation",
            message: "The Lighthouse arc is the strongest thing on TV.",
            rating: undefined,
          }),
        ],
        has_more: false,
        next_cursor: null,
      },
    ]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText(/The Lighthouse arc/)).toBeDefined());
  });

  it("links the title to the title detail page", async () => {
    const { fetcher } = makeFetcher([
      {
        activities: [event({ id: "wt:movie-1", type: "watched_title", rating: undefined })],
        has_more: false,
        next_cursor: null,
      },
    ]);
    render(<RecentActivityCard username="testuser" fetcher={fetcher} />, { wrapper: Wrapper });
    await waitFor(() => {
      const link = screen.getByRole("link", { name: "Halcyon Drift" });
      expect(link.getAttribute("href")).toBe("/title/movie-1");
    });
  });
});
