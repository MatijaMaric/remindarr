import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n";
import WatchlistCard from "./WatchlistCard";
import type { Title } from "../../types";

afterEach(() => cleanup());

function renderCard(show_status: Title["show_status"]) {
  const title = {
    id: "show-1",
    object_type: "SHOW",
    title: "Some Show",
    offers: [],
    genres: [],
    user_status: null,
    show_status,
  } as unknown as Title;
  render(
    <MemoryRouter>
      <WatchlistCard title={title} />
    </MemoryRouter>,
  );
}

describe("WatchlistCard status badge", () => {
  it("labels a not-started show as Not started, not Watching", () => {
    renderCard("not_started");
    expect(screen.getByText("Not started")).toBeDefined();
    expect(screen.queryByText("Watching")).toBeNull();
  });

  it("labels an unreleased show as Unreleased", () => {
    renderCard("unreleased");
    expect(screen.getByText("Unreleased")).toBeDefined();
  });
});
