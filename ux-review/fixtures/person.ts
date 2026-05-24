// Fixture for /api/details/person/:id — mocked because person data is TMDB-live (no DB table).
export const PERSON_ID = 1;

export const PERSON_FIXTURE = {
  id: PERSON_ID,
  name: "Jane Actor",
  biography:
    "A versatile performer known for dramatic roles in both independent and mainstream cinema.",
  birthday: "1985-03-12",
  deathday: null,
  place_of_birth: "New York, USA",
  known_for_department: "Acting",
  profile_path: null,
  also_known_as: ["Jana A."],
  popularity: 45.2,
  combined_credits: {
    cast: [
      {
        id: 603,
        title: "Seed Movie",
        release_date: "2020-01-01",
        poster_path: null,
        vote_average: 7.5,
        media_type: "movie",
        character: "Lead",
        order: 0,
      },
    ],
    crew: [],
  },
  external_ids: {
    imdb_id: "nm0000001",
  },
};
