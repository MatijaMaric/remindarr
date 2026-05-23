import { test, expect } from "@playwright/test";
import { mockLoggedOut } from "./helpers";
import { PersonPage } from "./pages/person-page";

test.describe.configure({ mode: "serial" });

const PERSON_RESPONSE = {
  person: {
    id: 287,
    name: "Brad Pitt",
    biography:
      "William Bradley Pitt (born December 18, 1963) is an American actor and film producer. Known for both his acting roles and his off-screen lifestyle, he has received multiple awards.",
    birthday: "1963-12-18",
    deathday: null,
    place_of_birth: "Shawnee, Oklahoma, USA",
    known_for_department: "Acting",
    profile_path: null,
    also_known_as: ["Brad Pitt"],
    popularity: 45.2,
    combined_credits: {
      cast: [
        {
          id: 550,
          media_type: "movie",
          title: "Fight Club",
          character: "Tyler Durden",
          release_date: "1999-10-15",
          poster_path: null,
          vote_average: 8.4,
          vote_count: 26000,
          popularity: 60.1,
        },
        {
          id: 4944,
          media_type: "movie",
          title: "Inglourious Basterds",
          character: "Lt. Aldo Raine",
          release_date: "2009-08-19",
          poster_path: null,
          vote_average: 8.3,
          vote_count: 20000,
          popularity: 45.5,
        },
      ],
      crew: [
        {
          id: 550,
          media_type: "movie",
          title: "Fight Club",
          job: "Producer",
          department: "Production",
          release_date: "1999-10-15",
          poster_path: null,
          vote_average: 8.4,
          vote_count: 26000,
          popularity: 60.1,
        },
      ],
    },
    external_ids: {
      imdb_id: "nm0000093",
      instagram_id: null,
      twitter_id: null,
    },
  },
};

const EMPTY_PERSON_RESPONSE = {
  person: {
    id: 99999,
    name: "Unknown Person",
    biography: "",
    birthday: null,
    deathday: null,
    place_of_birth: null,
    known_for_department: "",
    profile_path: null,
    also_known_as: [],
    popularity: 0.1,
    combined_credits: { cast: [], crew: [] },
    external_ids: {},
  },
};

async function setupPersonMocks(
  page: PersonPage["page"],
  personId: number | string,
  response: object,
) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await mockLoggedOut(page);
  await page.route(`**/api/details/person/${personId}`, (route) =>
    route.fulfill({ json: response }),
  );
}

test.describe("Person page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: page loads with name, bio, and filmography sections", async ({
    page,
  }) => {
    const pp = new PersonPage(page);
    await setupPersonMocks(page, 287, PERSON_RESPONSE);
    await pp.goto(287);
    await pp.waitForVisible(pp.heading());

    await expect(pp.heading()).toHaveText("Brad Pitt");
    await expect(
      page.getByText("Acting", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Born:/)).toBeVisible();
    await expect(page.getByText("Dec 18, 1963")).toBeVisible();
    await expect(page.getByText(/From:/)).toBeVisible();
    await expect(page.getByText("Shawnee, Oklahoma, USA")).toBeVisible();
    await expect(pp.biographyHeading()).toBeVisible();
    await expect(page.getByText(/William Bradley Pitt/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Acting \(2\)/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Crew \(1\)/i }),
    ).toBeVisible();
  });

  test("TC-02: unauthenticated user can access /person/:id (public page)", async ({
    page,
  }) => {
    const pp = new PersonPage(page);
    await setupPersonMocks(page, 287, PERSON_RESPONSE);
    await pp.goto(287);
    await pp.waitForVisible(pp.heading());

    // No redirect to /login
    expect(page.url()).toContain("/person/287");
    await expect(pp.heading()).toHaveText("Brad Pitt");
    // Unauthenticated nav shows Sign In
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("TC-03: clicking a credit card navigates to /title/:id", async ({
    page,
  }) => {
    const pp = new PersonPage(page);
    await setupPersonMocks(page, 287, PERSON_RESPONSE);
    await pp.goto(287);
    await pp.waitForVisible(pp.heading());

    // Find the Fight Club credit link and click it
    const fightClubLink = pp.creditLink("Fight Club");
    await pp.waitForVisible(fightClubLink);
    await fightClubLink.click();
    await page.waitForURL("**/title/movie-550**");

    expect(page.url()).toContain("/title/movie-550");
    // Person page heading is no longer the primary h1 — URL confirms navigation succeeded
    await expect(
      page.getByRole("heading", { level: 1, name: "Brad Pitt" }),
    ).not.toBeVisible();
  });

  test("TC-04: empty state — person has no known credits", async ({ page }) => {
    const pp = new PersonPage(page);
    await setupPersonMocks(page, 99999, EMPTY_PERSON_RESPONSE);
    await pp.goto(99999);
    await pp.waitForVisible(pp.heading());

    await expect(pp.heading()).toHaveText("Unknown Person");
    await expect(pp.actingHeading()).not.toBeVisible();
    await expect(pp.crewHeading()).not.toBeVisible();
    await expect(pp.biographyHeading()).not.toBeVisible();
    // No error message visible
    await expect(page.getByText(/error/i)).not.toBeVisible();
  });

  test("TC-05: long biography is truncated with Show more toggle", async ({
    page,
  }) => {
    const pp = new PersonPage(page);
    // Build a biography longer than 600 chars
    const longBio = "A ".repeat(400); // 800 chars
    const longBioResponse = {
      person: {
        ...PERSON_RESPONSE.person,
        biography: longBio,
      },
    };
    await setupPersonMocks(page, 287, longBioResponse);
    await pp.goto(287);
    await pp.waitForVisible(pp.biographyHeading());

    // Initially truncated — ends with "..."
    const bioText = page.getByText(/\.\.\./);
    await expect(bioText).toBeVisible();
    await expect(pp.showMoreButton()).toBeVisible();

    // Click Show more
    await pp.showMoreButton().click();
    await expect(pp.showLessButton()).toBeVisible();
    await expect(pp.showMoreButton()).not.toBeVisible();

    // Click Show less — collapses again
    await pp.showLessButton().click();
    await expect(pp.showMoreButton()).toBeVisible();
  });

  test("TC-06: error state — person not found (404)", async ({ page }) => {
    const pp = new PersonPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedOut(page);
    await page.route("**/api/details/person/99998", (route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } }),
    );
    await pp.goto(99998);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Person not found")).toBeVisible();
    await expect(pp.heading()).not.toBeVisible();
  });
});
