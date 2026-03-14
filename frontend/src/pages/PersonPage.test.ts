import { describe, it, expect } from "bun:test";
import type { PersonCastCredit, PersonCrewCredit } from "../types";

describe("PersonPage", () => {
  it("exports as default", async () => {
    const mod = await import("./PersonPage");
    expect(typeof mod.default).toBe("function");
  });
});

describe("PersonCastCredit type", () => {
  it("supports movie credits", () => {
    const credit: PersonCastCredit = {
      id: 550,
      media_type: "movie",
      title: "Fight Club",
      character: "Tyler Durden",
      release_date: "1999-10-15",
      poster_path: "/poster.jpg",
      vote_average: 8.4,
      vote_count: 25000,
      popularity: 60.5,
    };
    expect(credit.media_type).toBe("movie");
    expect(credit.title).toBe("Fight Club");
  });

  it("supports tv credits", () => {
    const credit: PersonCastCredit = {
      id: 1396,
      media_type: "tv",
      name: "Breaking Bad",
      character: "Walter White",
      first_air_date: "2008-01-20",
      poster_path: "/poster.jpg",
      vote_average: 8.9,
      vote_count: 12000,
      popularity: 80.2,
    };
    expect(credit.media_type).toBe("tv");
    expect(credit.name).toBe("Breaking Bad");
  });
});

describe("PersonCrewCredit type", () => {
  it("supports crew credits with job and department", () => {
    const credit: PersonCrewCredit = {
      id: 550,
      media_type: "movie",
      title: "Fight Club",
      job: "Director",
      department: "Directing",
      release_date: "1999-10-15",
      poster_path: "/poster.jpg",
      vote_average: 8.4,
      vote_count: 25000,
      popularity: 60.5,
    };
    expect(credit.job).toBe("Director");
    expect(credit.department).toBe("Directing");
  });
});
