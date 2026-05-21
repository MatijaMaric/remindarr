import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import * as api from "../../api";
import type { CollectionDetails } from "../../types";
import CollectionRow from "./CollectionRow";

const mockCollection: CollectionDetails = {
  id: 119,
  name: "The Lord of the Rings Collection",
  overview: "Epic fantasy trilogy.",
  poster_path: null,
  backdrop_path: null,
  parts: [
    { id: 120, title: "The Fellowship of the Ring", poster_path: "/f.jpg", backdrop_path: null, release_date: "2001-12-19", overview: "", vote_average: 8.4 },
    { id: 121, title: "The Two Towers", poster_path: "/t.jpg", backdrop_path: null, release_date: "2002-12-18", overview: "", vote_average: 8.4 },
    { id: 122, title: "The Return of the King", poster_path: "/r.jpg", backdrop_path: null, release_date: "2003-12-17", overview: "", vote_average: 8.9 },
  ],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getCollection").mockResolvedValue(mockCollection),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("CollectionRow", () => {
  it("renders the collection name as the section heading", async () => {
    render(
      <MemoryRouter>
        <CollectionRow collectionId={119} collectionName="The Lord of the Rings Collection" currentTitleId="movie-120" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByRole("heading", { name: "The Lord of the Rings Collection" }));
    expect(screen.getByRole("heading", { name: "The Lord of the Rings Collection" })).toBeDefined();
  });

  it("renders poster links for all collection parts", async () => {
    render(
      <MemoryRouter>
        <CollectionRow collectionId={119} collectionName="The Lord of the Rings Collection" currentTitleId="movie-999" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("The Fellowship of the Ring"));
    const fellowshipLink = screen.getByText("The Fellowship of the Ring").closest("a");
    expect(fellowshipLink?.getAttribute("href")).toBe("/title/movie-120");
    const towersLink = screen.getByText("The Two Towers").closest("a");
    expect(towersLink?.getAttribute("href")).toBe("/title/movie-121");
  });

  it("marks the current movie with aria-current", async () => {
    render(
      <MemoryRouter>
        <CollectionRow collectionId={119} collectionName="The Lord of the Rings Collection" currentTitleId="movie-120" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("The Fellowship of the Ring"));
    const fellowshipLink = screen.getByText("The Fellowship of the Ring").closest("a");
    expect(fellowshipLink?.getAttribute("aria-current")).toBe("true");
  });

  it("does not mark other movies with aria-current", async () => {
    render(
      <MemoryRouter>
        <CollectionRow collectionId={119} collectionName="The Lord of the Rings Collection" currentTitleId="movie-120" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("The Two Towers"));
    const towersLink = screen.getByText("The Two Towers").closest("a");
    expect(towersLink?.getAttribute("aria-current")).toBeNull();
  });

  it("renders nothing when there are no parts", async () => {
    (api.getCollection as any).mockResolvedValueOnce({ ...mockCollection, parts: [] });
    const { container } = render(
      <MemoryRouter>
        <CollectionRow collectionId={119} collectionName="The Lord of the Rings Collection" currentTitleId="movie-120" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
