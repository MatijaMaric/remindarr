import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PersonPage, { selectKnownFor, KNOWN_FOR_LIMIT } from "./PersonPage";
import * as api from "../api";
import type {
  PersonCastCredit,
  PersonCrewCredit,
  PersonDetailsResponse,
} from "../types";

function castCredit(
  overrides: Partial<PersonCastCredit> &
    Pick<PersonCastCredit, "id" | "media_type" | "popularity">,
): PersonCastCredit {
  return {
    title: "Movie",
    character: "Someone",
    poster_path: null,
    vote_average: 0,
    vote_count: 0,
    ...overrides,
  };
}

function crewCredit(
  overrides: Partial<PersonCrewCredit> &
    Pick<PersonCrewCredit, "id" | "media_type" | "popularity">,
): PersonCrewCredit {
  return {
    title: "Movie",
    job: "Director",
    department: "Directing",
    poster_path: null,
    vote_average: 0,
    vote_count: 0,
    ...overrides,
  };
}

describe("PersonPage", () => {
  it("exports as default", async () => {
    const mod = await import("./PersonPage");
    expect(typeof mod.default).toBe("function");
  });
});

describe("selectKnownFor", () => {
  it("ranks by popularity descending", () => {
    const result = selectKnownFor([
      castCredit({ id: 1, media_type: "movie", popularity: 10 }),
      castCredit({ id: 2, media_type: "movie", popularity: 50 }),
      castCredit({ id: 3, media_type: "movie", popularity: 30 }),
    ]);
    expect(result.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("de-duplicates across roles by media_type-id, keeping the highest-popularity occurrence", () => {
    const result = selectKnownFor([
      castCredit({ id: 7, media_type: "movie", popularity: 20 }),
      crewCredit({ id: 7, media_type: "movie", popularity: 90 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(7);
    expect(result[0].popularity).toBe(90);
  });

  it("caps at KNOWN_FOR_LIMIT (10)", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      castCredit({ id: i + 1, media_type: "movie", popularity: i }),
    );
    const result = selectKnownFor(many);
    expect(result).toHaveLength(KNOWN_FOR_LIMIT);
    expect(KNOWN_FOR_LIMIT).toBe(10);
  });

  it("returns fewer-than-limit verbatim with no padding", () => {
    const result = selectKnownFor([
      castCredit({ id: 1, media_type: "movie", popularity: 5 }),
      castCredit({ id: 2, media_type: "tv", popularity: 9 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(selectKnownFor([])).toEqual([]);
  });

  it("does NOT collapse a movie and a TV title that share the same numeric id", () => {
    const result = selectKnownFor([
      castCredit({ id: 42, media_type: "movie", popularity: 10 }),
      castCredit({ id: 42, media_type: "tv", popularity: 8 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.media_type).sort()).toEqual(["movie", "tv"]);
  });
});

function makeResponse(
  cast: PersonCastCredit[],
  crew: PersonCrewCredit[],
): PersonDetailsResponse {
  return {
    person: {
      id: 287,
      name: "Test Person",
      biography: "A biography.",
      birthday: null,
      deathday: null,
      place_of_birth: null,
      known_for_department: "Acting",
      profile_path: null,
      also_known_as: [],
      popularity: 1,
      combined_credits: { cast, crew },
    },
  };
}

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderPersonPage() {
  return render(
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/person/287"]}>
        <Routes>
          <Route path="/person/:personId" element={<PersonPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PersonPage Known For section", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Known For above Acting and keeps Acting/Crew sections", async () => {
    const cast = [
      castCredit({
        id: 550,
        media_type: "movie",
        title: "Fight Club",
        character: "Tyler",
        popularity: 90,
      }),
    ];
    const crew = [
      crewCredit({
        id: 99,
        media_type: "movie",
        title: "Directed Film",
        job: "Director",
        popularity: 80,
      }),
    ];
    const spy = spyOn(api, "getPersonDetails").mockResolvedValue(
      makeResponse(cast, crew),
    );

    renderPersonPage();

    await waitFor(() => {
      expect(screen.getByText("Known For")).toBeDefined();
    });

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "");
    const knownForIdx = headings.findIndex((t) => t.startsWith("Known For"));
    const actingIdx = headings.findIndex((t) => t.startsWith("Acting"));
    const crewIdx = headings.findIndex((t) => t.startsWith("Crew"));

    // Known For appears, above Acting; Acting and Crew remain (no regression).
    expect(knownForIdx).toBeGreaterThanOrEqual(0);
    expect(actingIdx).toBeGreaterThanOrEqual(0);
    expect(crewIdx).toBeGreaterThanOrEqual(0);
    expect(knownForIdx).toBeLessThan(actingIdx);

    spy.mockRestore();
  });

  it("links Known For cards to /title/{media_type}-{id}", async () => {
    const cast = [
      castCredit({
        id: 550,
        media_type: "movie",
        title: "Fight Club",
        popularity: 90,
      }),
    ];
    const spy = spyOn(api, "getPersonDetails").mockResolvedValue(
      makeResponse(cast, []),
    );

    renderPersonPage();

    await waitFor(() => {
      expect(screen.getByText("Known For")).toBeDefined();
    });

    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toContain("/title/movie-550");

    spy.mockRestore();
  });

  it("hides the Known For section when the person has no credits", async () => {
    const spy = spyOn(api, "getPersonDetails").mockResolvedValue(
      makeResponse([], []),
    );

    renderPersonPage();

    await waitFor(() => {
      expect(screen.getByText("Test Person")).toBeDefined();
    });

    expect(screen.queryByText("Known For")).toBeNull();

    spy.mockRestore();
  });
});
