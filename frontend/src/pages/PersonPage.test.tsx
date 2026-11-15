import { describe, it, expect, afterEach, spyOn } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PersonPage, {
  selectKnownFor,
  mergeByTitle,
  sortFilmography,
  knownForScore,
  KNOWN_FOR_LIMIT,
  ROW_LIMIT,
} from "./PersonPage";
import * as api from "../api";
import * as authModule from "../context/AuthContext";
import { ApiError } from "../lib/api-error";
import type {
  PersonCastCredit,
  PersonCrewCredit,
  PersonDetailsResponse,
} from "../types";

function castCredit(
  overrides: Partial<PersonCastCredit> &
    Pick<PersonCastCredit, "id" | "media_type">,
): PersonCastCredit {
  return {
    title: "Movie",
    character: "Someone",
    poster_path: null,
    vote_count: 0,
    popularity: 0,
    ...overrides,
  };
}

function crewCredit(
  overrides: Partial<PersonCrewCredit> &
    Pick<PersonCrewCredit, "id" | "media_type">,
): PersonCrewCredit {
  return {
    title: "Movie",
    job: "Director",
    poster_path: null,
    vote_count: 0,
    popularity: 0,
    ...overrides,
  };
}

/** `n` distinct movies, ids starting at `from`, so Known For has enough titles to show. */
function manyMovies(n: number, from = 1000): PersonCastCredit[] {
  return Array.from({ length: n }, (_, i) =>
    castCredit({
      id: from + i,
      media_type: "movie",
      title: `Film ${from + i}`,
      vote_count: i,
      release_date: `20${String(10 + (i % 15)).padStart(2, "0")}-01-01`,
    }),
  );
}

describe("PersonPage", () => {
  it("exports as default", async () => {
    const mod = await import("./PersonPage");
    expect(typeof mod.default).toBe("function");
  });
});

describe("selectKnownFor", () => {
  it("ranks by vote_count descending (rating volume, not trending popularity)", () => {
    const result = selectKnownFor([
      castCredit({
        id: 1,
        media_type: "movie",
        vote_count: 10,
        popularity: 999,
      }),
      castCredit({ id: 2, media_type: "movie", vote_count: 50, popularity: 1 }),
      castCredit({ id: 3, media_type: "movie", vote_count: 30, popularity: 1 }),
    ]);
    expect(result.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("breaks score ties by popularity descending", () => {
    const result = selectKnownFor([
      castCredit({
        id: 1,
        media_type: "movie",
        vote_count: 100,
        popularity: 5,
      }),
      castCredit({
        id: 2,
        media_type: "movie",
        vote_count: 100,
        popularity: 9,
      }),
    ]);
    expect(result.map((c) => c.id)).toEqual([2, 1]);
  });

  it("puts titles in the viewer's library first", () => {
    // Danny DeVito opened from It's Always Sunny: the show must make Known For.
    const result = selectKnownFor([
      ...manyMovies(KNOWN_FOR_LIMIT).map((c) => ({ ...c, vote_count: 50000 })),
      castCredit({
        id: 2710,
        media_type: "tv",
        character: "Frank Reynolds",
        vote_count: 1465,
        episode_count: 180,
        in_library: true,
      }),
    ]);
    expect(result[0].id).toBe(2710);
    expect(result).toHaveLength(KNOWN_FOR_LIMIT);
  });

  it("weights TV credits by episode count, so a one-episode spot loses to a lead role", () => {
    const result = selectKnownFor([
      castCredit({
        id: 1,
        media_type: "tv",
        character: "Dr. Dogballs (voice)",
        vote_count: 11593,
        episode_count: 1,
      }),
      castCredit({
        id: 2,
        media_type: "tv",
        character: "Frank Reynolds",
        vote_count: 1465,
        episode_count: 180,
      }),
    ]);
    expect(result.map((c) => c.id)).toEqual([2, 1]);
  });

  it("demotes uncredited cameos", () => {
    expect(
      knownForScore(
        castCredit({
          id: 1,
          media_type: "movie",
          character: "Alien on TV Monitor (uncredited)",
          vote_count: 15000,
        }),
      ),
    ).toBe(1500);
    expect(
      knownForScore(
        crewCredit({ id: 2, media_type: "movie", vote_count: 15000 }),
      ),
    ).toBe(15000);
  });

  it("ranks Self appearances after every narrative role, filling only spare slots", () => {
    const result = selectKnownFor([
      castCredit({
        id: 1,
        media_type: "movie",
        character: "Evelyn",
        vote_count: 100,
      }),
      castCredit({
        id: 2,
        media_type: "tv",
        character: "Self",
        vote_count: 9000,
      }),
      castCredit({
        id: 3,
        media_type: "tv",
        character: "Self - Guest",
        vote_count: 8000,
      }),
      castCredit({
        id: 4,
        media_type: "tv",
        character: "Herself",
        vote_count: 7000,
      }),
    ]);
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4]);

    const full = selectKnownFor([
      ...manyMovies(KNOWN_FOR_LIMIT),
      castCredit({
        id: 2,
        media_type: "tv",
        character: "Self",
        vote_count: 9000,
      }),
    ]);
    expect(full.map((c) => c.id)).not.toContain(2);
  });

  it("keeps a Self title from the viewer's library ahead of everything else", () => {
    // Kaleb Cooper opened from Clarkson's Farm ("Self - Farmer").
    const result = selectKnownFor([
      ...manyMovies(KNOWN_FOR_LIMIT),
      castCredit({
        id: 117648,
        media_type: "tv",
        character: "Self - Farmer",
        episode_count: 40,
        in_library: true,
      }),
    ]);
    expect(result[0].id).toBe(117648);
  });

  it("de-duplicates across roles by media_type-id, keeping the highest-ranked occurrence", () => {
    const result = selectKnownFor([
      castCredit({
        id: 7,
        media_type: "movie",
        vote_count: 20,
        popularity: 90,
      }),
      crewCredit({
        id: 7,
        media_type: "movie",
        vote_count: 90,
        popularity: 20,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].vote_count).toBe(90);
  });

  it("caps at KNOWN_FOR_LIMIT (10)", () => {
    expect(selectKnownFor(manyMovies(25))).toHaveLength(KNOWN_FOR_LIMIT);
    expect(KNOWN_FOR_LIMIT).toBe(10);
  });

  it("returns an empty array for empty input", () => {
    expect(selectKnownFor([])).toEqual([]);
  });

  it("does NOT collapse a movie and a TV title that share the same numeric id", () => {
    const result = selectKnownFor([
      castCredit({ id: 42, media_type: "movie", vote_count: 10 }),
      castCredit({ id: 42, media_type: "tv", vote_count: 8 }),
    ]);
    expect(result.map((c) => c.media_type).sort()).toEqual(["movie", "tv"]);
  });
});

describe("mergeByTitle", () => {
  it("joins every job on one title into one entry", () => {
    const merged = mergeByTitle([
      crewCredit({
        id: 9,
        media_type: "movie",
        title: "Matilda",
        job: "Producer",
      }),
      crewCredit({
        id: 9,
        media_type: "movie",
        title: "Matilda",
        job: "Director",
      }),
      crewCredit({
        id: 9,
        media_type: "movie",
        title: "Matilda",
        job: "Director",
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].roles).toBe("Producer · Director");
  });

  it("keys by media type and id, so a movie and a show with the same id stay apart", () => {
    const merged = mergeByTitle([
      castCredit({ id: 42, media_type: "movie" }),
      castCredit({ id: 42, media_type: "tv" }),
    ]);
    expect(merged.map((m) => m.key)).toEqual(["movie-42", "tv-42"]);
  });

  it("drops empty roles and marks a title Self only when every role is Self", () => {
    const merged = mergeByTitle([
      castCredit({ id: 1, media_type: "tv", character: "Self (uncredited)" }),
      castCredit({ id: 1, media_type: "tv", character: "Dr. Anthony Fauci" }),
      castCredit({ id: 2, media_type: "tv", character: "Self" }),
      castCredit({ id: 2, media_type: "tv", character: "Self - Guest" }),
      castCredit({ id: 3, media_type: "movie", character: "" }),
    ]);
    expect(merged.map((m) => m.self)).toEqual([false, true, false]);
    expect(merged[2].roles).toBe("");
  });
});

describe("sortFilmography", () => {
  it("orders newest first, undated after dated, Self appearances last", () => {
    const titles = mergeByTitle([
      castCredit({
        id: 1,
        media_type: "tv",
        character: "Self",
        first_air_date: "2025-01-01",
      }),
      castCredit({ id: 2, media_type: "movie", release_date: "1999-10-15" }),
      castCredit({ id: 3, media_type: "movie" }),
      castCredit({ id: 4, media_type: "movie", release_date: "2019-07-26" }),
      castCredit({
        id: 5,
        media_type: "tv",
        character: "Self",
        first_air_date: "1996-07-22",
      }),
    ]);
    expect(sortFilmography(titles).map((t) => t.credit.id)).toEqual([
      4, 2, 3, 1, 5,
    ]);
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
      combined_credits: { cast, crew },
    },
  };
}

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

// Spy on useAuth rather than rendering <AuthContext>: other page tests
// mock.module() AuthContext with a non-component `AuthContext`, and Bun leaks
// those mocks across files, which made <AuthContext> an invalid element type.
let useAuthSpy: ReturnType<typeof spyOn<typeof authModule, "useAuth">> | null =
  null;
let apiSpy: { mockRestore(): void } | null = null;

afterEach(() => {
  cleanup();
  useAuthSpy?.mockRestore();
  useAuthSpy = null;
  apiSpy?.mockRestore();
  apiSpy = null;
});

function renderPersonPage(user: { id: string } | null = null) {
  useAuthSpy = spyOn(authModule, "useAuth").mockReturnValue({
    user,
    providers: null,
    loading: false,
  } as any);
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

function mockPerson(response: PersonDetailsResponse) {
  apiSpy = spyOn(api, "getPersonDetails").mockResolvedValue(response);
}

function section(heading: RegExp): HTMLElement {
  return screen.getByRole("heading", { name: heading }).closest("section")!;
}

describe("PersonPage follow button", () => {
  it("shows the person's follow state to a signed-in user", async () => {
    mockPerson({ ...makeResponse([], []), is_following: true });
    renderPersonPage({ id: "u1" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Following" })).toBeDefined(),
    );
  });

  it("hides the follow button when signed out", async () => {
    mockPerson(makeResponse([], []));
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Test Person")).toBeDefined());
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });
});

describe("PersonPage Known For section", () => {
  it("renders Known For above Acting and keeps Acting/Crew sections", async () => {
    const crew = [
      crewCredit({ id: 99, media_type: "movie", title: "Directed Film" }),
    ];
    mockPerson(makeResponse(manyMovies(11), crew));
    renderPersonPage();

    await waitFor(() => expect(screen.getByText("Known For")).toBeDefined());
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "");
    const knownForIdx = headings.findIndex((t) => t.startsWith("Known For"));
    const actingIdx = headings.findIndex((t) => t.startsWith("Acting"));
    const crewIdx = headings.findIndex((t) => t.startsWith("Crew"));
    expect(knownForIdx).toBeGreaterThanOrEqual(0);
    expect(crewIdx).toBeGreaterThanOrEqual(0);
    expect(knownForIdx).toBeLessThan(actingIdx);
  });

  it("links Known For cards to /title/{media_type}-{id}", async () => {
    mockPerson(makeResponse(manyMovies(11), []));
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Known For")).toBeDefined());
    const links = within(section(/^Known For$/))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toContain("/title/movie-1010");
  });

  it("hides Known For when the person has 10 titles or fewer (the rows already show them all)", async () => {
    mockPerson(
      makeResponse(
        [
          castCredit({ id: 550, media_type: "movie", title: "Fight Club" }),
          castCredit({
            id: 10720,
            media_type: "movie",
            title: "Down with Love",
          }),
        ],
        [],
      ),
    );
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Acting (2)")).toBeDefined());
    expect(screen.queryByText("Known For")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Fight Club/ })).toHaveLength(1);
  });

  it("hides the Known For section when the person has no credits", async () => {
    mockPerson(makeResponse([], []));
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Test Person")).toBeDefined());
    expect(screen.queryByText("Known For")).toBeNull();
  });
});

describe("PersonPage filmography rows", () => {
  it("shows one card per title with its jobs joined", async () => {
    mockPerson(
      makeResponse(
        [],
        [
          crewCredit({
            id: 9,
            media_type: "movie",
            title: "Matilda",
            job: "Producer",
          }),
          crewCredit({
            id: 9,
            media_type: "movie",
            title: "Matilda",
            job: "Director",
          }),
        ],
      ),
    );
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Crew (1)")).toBeDefined());
    expect(screen.getByText("Producer · Director")).toBeDefined();
  });

  it(`caps a row at ${ROW_LIMIT} cards and expands to all of them`, async () => {
    mockPerson(makeResponse(manyMovies(30), []));
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Acting (30)")).toBeDefined());

    const acting = section(/^Acting/);
    expect(within(acting).getAllByRole("link")).toHaveLength(ROW_LIMIT);

    fireEvent.click(
      within(acting).getByRole("button", { name: "Show all 30" }),
    );
    expect(within(acting).getAllByRole("link")).toHaveLength(30);

    fireEvent.click(within(acting).getByRole("button", { name: "Show fewer" }));
    expect(within(acting).getAllByRole("link")).toHaveLength(ROW_LIMIT);
  });

  it("has no Show all button when the row fits", async () => {
    mockPerson(makeResponse(manyMovies(3), []));
    renderPersonPage();
    await waitFor(() => expect(screen.getByText("Acting (3)")).toBeDefined());
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});

describe("PersonPage errors", () => {
  it("says the person was not found on a 404", async () => {
    apiSpy = spyOn(api, "getPersonDetails").mockRejectedValue(
      new ApiError("Person not found", 404),
    );
    renderPersonPage();
    await waitFor(() =>
      expect(screen.getByText("Person not found")).toBeDefined(),
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says it couldn't load (not 'not found') on any other failure, with a retry", async () => {
    apiSpy = spyOn(api, "getPersonDetails").mockRejectedValue(
      new ApiError("Failed to fetch person", 503),
    );
    renderPersonPage();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load this person")).toBeDefined(),
    );
    expect(screen.queryByText("Person not found")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
