import { mock } from "bun:test";

// Must use mock.module (hoisted before imports) to avoid Bun mock leak.
// Return correct API shapes so downstream tests aren't corrupted.
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

mock.module("./FullBleedCarousel", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel">{children}</div>
  ),
}));

mock.module("../lib/tmdb-images", () => ({
  posterUrl: (url: string | null) => url,
}));

import { describe, it, expect, vi } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import UpNextRow from "./UpNextRow";
import type { UpNextItem } from "../api";

function renderRow(items: UpNextItem[], onMarkWatched = vi.fn()) {
  return render(
    <MemoryRouter>
      <UpNextRow items={items} onMarkWatched={onMarkWatched} />
    </MemoryRouter>,
  );
}

const inProgressItem: UpNextItem = {
  kind: "in_progress",
  titleId: 1,
  title: "Breaking Bad",
  posterUrl: "/bb.jpg",
  nextEpisodeId: 42,
  nextEpisodeTitle: "Pilot",
  nextEpisodeSeason: 1,
  nextEpisodeNumber: 1,
  nextEpisodeAirDate: "2008-01-20",
  unwatchedCount: 3,
};

const newlyAiredItem: UpNextItem = {
  kind: "newly_aired",
  titleId: 2,
  title: "Better Call Saul",
  posterUrl: "/bcs.jpg",
  nextEpisodeId: 99,
  nextEpisodeSeason: 1,
  nextEpisodeNumber: 1,
  unwatchedCount: 1,
};

const recommendationItem: UpNextItem = {
  kind: "recommendation",
  titleId: 3,
  title: "The Wire",
  posterUrl: "/tw.jpg",
  recommendedBy: "alice",
  recommendationId: 7,
};

describe("UpNextRow", () => {
  it("shows empty state when items array is empty", () => {
    renderRow([]);
    expect(screen.getByText("home.upNext.empty")).toBeTruthy();
  });

  it("renders in-progress items", () => {
    renderRow([inProgressItem]);
    expect(screen.getByText("Breaking Bad")).toBeTruthy();
    expect(screen.getByText("home.upNext.inProgress")).toBeTruthy();
  });

  it("renders newly-aired items", () => {
    renderRow([newlyAiredItem]);
    expect(screen.getByText("Better Call Saul")).toBeTruthy();
    expect(screen.getByText("home.upNext.newEpisodes")).toBeTruthy();
  });

  it("renders recommendation items with 'from @' text", () => {
    renderRow([recommendationItem]);
    expect(screen.getByText("The Wire")).toBeTruthy();
    expect(screen.getByText("from @alice")).toBeTruthy();
  });

  it("renders the mark watched button on episode cards", () => {
    renderRow([inProgressItem]);
    expect(screen.getByText("home.markWatched")).toBeTruthy();
  });

  it("does not render mark watched button on recommendation cards", () => {
    renderRow([recommendationItem]);
    // home.markWatched should not appear for recommendation items
    const btns = screen.queryAllByText("home.markWatched");
    expect(btns.length).toBe(0);
  });

  it("calls onMarkWatched with the correct episodeId when button is clicked", () => {
    const onMarkWatched = vi.fn();
    renderRow([inProgressItem], onMarkWatched);
    const btn = screen.getByText("home.markWatched");
    fireEvent.click(btn);
    expect(onMarkWatched).toHaveBeenCalledWith(42);
  });

  it("renders multiple items in the carousel", () => {
    renderRow([inProgressItem, newlyAiredItem, recommendationItem]);
    expect(screen.getByText("Breaking Bad")).toBeTruthy();
    expect(screen.getByText("Better Call Saul")).toBeTruthy();
    expect(screen.getByText("The Wire")).toBeTruthy();
  });
});
