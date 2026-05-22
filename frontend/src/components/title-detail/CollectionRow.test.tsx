import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
    {
      id: 120,
      title: "The Fellowship of the Ring",
      poster_path: "/f.jpg",
      backdrop_path: null,
      release_date: "2001-12-19",
      overview: "",
      vote_average: 8.4,
    },
    {
      id: 121,
      title: "The Two Towers",
      poster_path: "/t.jpg",
      backdrop_path: null,
      release_date: "2002-12-18",
      overview: "",
      vote_average: 8.4,
    },
    {
      id: 122,
      title: "The Return of the King",
      poster_path: "/r.jpg",
      backdrop_path: null,
      release_date: "2003-12-17",
      overview: "",
      vote_average: 8.9,
    },
  ],
};

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [spyOn(api, "getCollection").mockResolvedValue(mockCollection)];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("CollectionRow", () => {
  it("renders the collection name as the section heading", async () => {
    render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-120"
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      screen.getByRole("heading", { name: "The Lord of the Rings Collection" }),
    );
    expect(
      screen.getByRole("heading", { name: "The Lord of the Rings Collection" }),
    ).toBeDefined();
  });

  it("renders poster links for all collection parts", async () => {
    render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-999"
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => screen.getByText("The Fellowship of the Ring"));
    const fellowshipLink = screen
      .getByText("The Fellowship of the Ring")
      .closest("a");
    expect(fellowshipLink?.getAttribute("href")).toBe("/title/movie-120");
    const towersLink = screen.getByText("The Two Towers").closest("a");
    expect(towersLink?.getAttribute("href")).toBe("/title/movie-121");
  });

  it("marks the current movie with aria-current", async () => {
    render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-120"
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => screen.getByText("The Fellowship of the Ring"));
    const fellowshipLink = screen
      .getByText("The Fellowship of the Ring")
      .closest("a");
    expect(fellowshipLink?.getAttribute("aria-current")).toBe("true");
  });

  it("does not mark other movies with aria-current", async () => {
    render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-120"
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => screen.getByText("The Two Towers"));
    const towersLink = screen.getByText("The Two Towers").closest("a");
    expect(towersLink?.getAttribute("aria-current")).toBeNull();
  });

  it("gives the scroll row top padding so the current item's ring isn't clipped", async () => {
    render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-120"
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => screen.getByText("The Fellowship of the Ring"));
    const row = screen
      .getByText("The Fellowship of the Ring")
      .closest("a")!.parentElement!;
    expect(row.className).toContain("py-1");
    expect(row.className).not.toContain("pb-1");
  });

  it("renders nothing when there are no parts", () => {
    const testClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    testClient.setQueryData(["collection", 119], {
      ...mockCollection,
      parts: [],
    });
    function TestWrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={testClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      );
    }
    const { container } = render(
      <CollectionRow
        collectionId={119}
        collectionName="The Lord of the Rings Collection"
        currentTitleId="movie-120"
      />,
      { wrapper: TestWrapper },
    );
    expect(container.firstChild).toBeNull();
  });
});
