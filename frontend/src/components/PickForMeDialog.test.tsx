import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import * as api from "../api";
import type { Title } from "../types";
import "../i18n";
import PickForMeDialog from "./PickForMeDialog";

const title: Title = {
  id: "movie-123",
  title: "Test Movie",
  object_type: "MOVIE",
  release_year: 2024,
  runtime_minutes: 90,
  original_title: null,
  release_date: null,
  short_description: null,
  genres: [],
  imdb_id: null,
  tmdb_id: null,
  poster_url: null,
  age_certification: null,
  original_language: null,
  tmdb_url: null,
  imdb_score: null,
  imdb_votes: null,
  tmdb_score: null,
  is_tracked: true,
  offers: [],
};

let pick: ReturnType<typeof spyOn<typeof api, "pickTrackedTitle">>;

beforeEach(() => {
  pick = spyOn(api, "pickTrackedTitle").mockResolvedValue(title);
});

afterEach(() => {
  cleanup();
  pick.mockRestore();
  sessionStorage.clear();
});

function openAndPick() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PickForMeDialog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pick for me" }));
  fireEvent.click(screen.getByRole("button", { name: "Pick" }));
}

it("renders the picked title with a Watch link", async () => {
  openAndPick();
  expect(await screen.findByText("Test Movie")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Watch" }).getAttribute("href")).toBe(
    "/title/movie-123",
  );
});

it("dismisses the current title before picking another", async () => {
  pick.mockResolvedValueOnce(title).mockResolvedValueOnce(null);
  openAndPick();
  fireEvent.click(await screen.findByRole("button", { name: "Another" }));
  await waitFor(() =>
    expect(pick).toHaveBeenLastCalledWith(
      expect.objectContaining({ exclude: [title.id] }),
    ),
  );
});

it("shows the empty state when the API returns null", async () => {
  pick.mockResolvedValueOnce(null);
  openAndPick();
  expect(await screen.findByText("No results found")).toBeTruthy();
});
