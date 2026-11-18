import { Hono } from "hono";
import { z } from "zod";
import {
  getTitleById,
  upsertTitles,
  upsertEpisodes,
  isPinnedTitle,
} from "../db/repository";
import { CONFIG } from "../config";
import {
  fetchMovieDetails,
  fetchTvDetails,
  fetchMovieFullDetails,
  fetchShowFullDetails,
  fetchSeasonDetails,
  fetchEpisodeDetails,
  fetchPersonDetails,
  fetchMovieSuggestions,
  fetchTvSuggestions,
  getMovieGenres,
  getTvGenres,
  fetchCollection,
} from "../tmdb/client";
import {
  parseMovieDetails,
  parseTvDetails,
  parseDiscoverMovie,
  parseDiscoverTv,
} from "../tmdb/parser";
import type { AppEnv } from "../types";
import type {
  TmdbMovieFullDetails,
  TmdbShowFullDetails,
  TmdbSeasonDetails,
} from "../tmdb/types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";
import { episodeRuntime } from "../db/repository/episode-runtime";
import { getUserPace, computeEta } from "../db/repository/stats";
import { getDb, episodes as episodesTable } from "../db/schema";
import { isFollowingPerson } from "../db/repository/person-follows";
import { getTrackedTitleIds } from "../db/repository/tracked";
import type {
  TmdbPersonCastCredit,
  TmdbPersonCrewCredit,
  TmdbPersonDetails,
} from "../tmdb/types";
import { sql, eq, and, asc } from "drizzle-orm";

const log = logger.child({ module: "details" });

// tmdbRequest throws "TMDB API error <status>: ..." for non-2xx replies. A 404
// is a bad id from the client, so it logs at warn, not error.
function isTmdbNotFound(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith("TMDB API error 404");
}

const titleIdParam = z.object({
  id: z.string().regex(/^(movie|tv)-\d+$/, "id must match movie-N or tv-N"),
});
const seasonParam = titleIdParam.extend({
  season: z.coerce.number().int().min(0),
});
const episodeParam = seasonParam.extend({
  episode: z.coerce.number().int().min(1),
});
const personIdParam = z.object({
  personId: z.coerce.number().int().min(1),
});
const suggestionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
const collectionIdParam = z.object({
  id: z.coerce.number().int().min(1),
});

const app = new Hono<AppEnv>();

const country = CONFIG.COUNTRY;

function parseTitleId(
  titleId: string,
): { type: "MOVIE" | "SHOW"; tmdbId: number } | null {
  const movieMatch = titleId.match(/^movie-(\d+)$/);
  if (movieMatch) return { type: "MOVIE", tmdbId: parseInt(movieMatch[1], 10) };

  const tvMatch = titleId.match(/^tv-(\d+)$/);
  if (tvMatch) return { type: "SHOW", tmdbId: parseInt(tvMatch[1], 10) };

  return null;
}

// The detail pages only read the configured country's providers (and, for
// movie release dates, that country with a US fallback). TMDB returns every
// country, which was two thirds of the show response.
function onlyCountryProviders<
  T extends TmdbMovieFullDetails | TmdbShowFullDetails,
>(tmdb: T): T {
  const all = tmdb["watch/providers"]?.results;
  if (!all) return tmdb;
  const results = all[country] ? { [country]: all[country] } : {};
  return { ...tmdb, "watch/providers": { results } };
}

function trimMovieDetails(tmdb: TmdbMovieFullDetails): TmdbMovieFullDetails {
  const trimmed = onlyCountryProviders(tmdb);
  return {
    ...trimmed,
    // The page shows directors and writers only; the full crew can be 800+ people.
    credits: trimmed.credits && {
      ...trimmed.credits,
      crew: (trimmed.credits.crew ?? []).filter(
        (c) => c.job === "Director" || c.department === "Writing",
      ),
    },
    release_dates: trimmed.release_dates && {
      results: (trimmed.release_dates.results ?? []).filter(
        (r) => r.iso_3166_1 === country || r.iso_3166_1 === "US",
      ),
    },
  };
}

// The season page never renders per-episode guest stars or crew; the episode
// page fetches its own credits.
function trimSeasonDetails(tmdb: TmdbSeasonDetails): TmdbSeasonDetails {
  return {
    ...tmdb,
    episodes: tmdb.episodes.map((ep) => ({ ...ep, guest_stars: [], crew: [] })),
  };
}

async function pinnedFlag(userId: string | undefined, titleId: string) {
  if (!userId) return undefined;
  try {
    return await isPinnedTitle(userId, titleId);
  } catch (e) {
    log.error("Pinned lookup failed", { titleId, err: e });
    return undefined;
  }
}

async function getOrFetchTitle(titleId: string, userId?: string) {
  let title = await getTitleById(titleId, userId);
  if (title) return title;

  const parsed = parseTitleId(titleId);
  if (!parsed || !CONFIG.TMDB_API_KEY) return null;

  try {
    if (parsed.type === "MOVIE") {
      const tmdbData = await fetchMovieDetails(parsed.tmdbId);
      await upsertTitles([parseMovieDetails(tmdbData)]);
    } else {
      const tmdbData = await fetchTvDetails(parsed.tmdbId);
      await upsertTitles([parseTvDetails(tmdbData)]);
    }
  } catch (e) {
    log.error("TMDB fallback fetch failed", { titleId, err: e });
    return null;
  }

  return await getTitleById(titleId, userId);
}

app.get("/movie/:id", zValidator("param", titleIdParam), async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      const full = await fetchMovieFullDetails(title.tmdb_id);
      tmdb = full && trimMovieDetails(full);
    } catch (e) {
      log.error("TMDB movie fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  const isPinned = await pinnedFlag(user?.id, title.id);

  setPublicCacheIfAnon(c, 3600);
  return ok(c, { title: { ...title, is_pinned: isPinned }, tmdb, country });
});

app.get("/show/:id", zValidator("param", titleIdParam), async (c) => {
  const user = c.get("user");
  const titleId = c.req.param("id");
  const title = await getOrFetchTitle(titleId, user?.id);
  if (!title) return err(c, "Title not found", 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      const full = await fetchShowFullDetails(title.tmdb_id);
      tmdb = full && onlyCountryProviders(full);
    } catch (e) {
      log.error("TMDB show fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  let etaDays: number | null = null;
  if (user && title.is_tracked) {
    try {
      const db = getDb();
      const runtime = episodeRuntime(
        sql`e.runtime_minutes`,
        sql`ti.runtime_minutes`,
      );
      const remainingRows = await db.all<{
        remaining_minutes: number | null;
      }>(sql`
        SELECT CASE WHEN COUNT(*) = COUNT(${runtime})
          THEN COALESCE(SUM(${runtime}), 0) END AS remaining_minutes
        FROM episodes e JOIN titles ti ON ti.id = e.title_id
        WHERE e.title_id = ${titleId}
          AND e.air_date <= date('now')
          AND e.id NOT IN (
            SELECT we.episode_id FROM watched_episodes we WHERE we.user_id = ${user.id}
          )
      `);
      const remainingMinutes = remainingRows[0]?.remaining_minutes ?? 0;
      if (remainingMinutes > 0) {
        const pace = await getUserPace(user.id);
        etaDays = computeEta(remainingMinutes, pace.minutesPerDay);
      }
    } catch (e) {
      log.error("ETA computation failed", { titleId, err: e });
    }
  }

  const isPinned = await pinnedFlag(user?.id, titleId);

  setPublicCacheIfAnon(c, 3600);
  return ok(c, {
    title: { ...title, eta_days: etaDays, is_pinned: isPinned },
    tmdb,
    country,
  });
});

app.get(
  "/show/:id/season/:season",
  zValidator("param", seasonParam),
  async (c) => {
    const user = c.get("user");
    const title = await getOrFetchTitle(c.req.param("id"), user?.id);
    if (!title) return err(c, "Title not found", 404);

    const seasonNumber = c.req.valid("param").season;

    let tmdb = null;
    let seasons: {
      season_number: number;
      name: string;
      episode_count: number;
      air_date: string | null;
      poster_path: string | null;
    }[] = [];

    if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
      const [seasonResult, showResult] = await Promise.allSettled([
        fetchSeasonDetails(title.tmdb_id, seasonNumber),
        fetchShowFullDetails(title.tmdb_id),
      ]);

      if (seasonResult.status === "fulfilled") {
        tmdb = seasonResult.value && trimSeasonDetails(seasonResult.value);
        try {
          if (tmdb)
            await upsertEpisodes(
              tmdb.episodes.map((ep) => ({
                title_id: title.id,
                season_number: ep.season_number,
                episode_number: ep.episode_number,
                name: ep.name,
                overview: ep.overview,
                air_date: ep.air_date,
                still_path: ep.still_path,
                runtime_minutes: ep.runtime,
              })),
            );
        } catch (err) {
          log.error("Failed to persist season episodes", {
            titleId: title.id,
            season: seasonNumber,
            err,
          });
        }
      } else {
        log[isTmdbNotFound(seasonResult.reason) ? "warn" : "error"](
          "TMDB season fetch failed",
          {
            tmdbId: title.tmdb_id,
            season: seasonNumber,
            err: seasonResult.reason,
          },
        );
      }

      if (showResult.status === "fulfilled" && showResult.value?.seasons) {
        seasons = showResult.value.seasons
          .filter((s: { season_number: number }) => s.season_number > 0)
          .sort(
            (a: { season_number: number }, b: { season_number: number }) =>
              a.season_number - b.season_number,
          )
          .map(
            (s: {
              season_number: number;
              name: string;
              episode_count: number;
              air_date: string | null;
              poster_path: string | null;
            }) => ({
              season_number: s.season_number,
              name: s.name,
              episode_count: s.episode_count,
              air_date: s.air_date,
              poster_path: s.poster_path,
            }),
          );
      }
    }

    // Fallback: when TMDB is unavailable, build a minimal season response from
    // the local episodes table so the season detail page can render episode rows.
    if (!tmdb) {
      const db = getDb();
      const dbEpisodes = await db
        .select({
          id: episodesTable.id,
          name: episodesTable.name,
          overview: episodesTable.overview,
          air_date: episodesTable.airDate,
          episode_number: episodesTable.episodeNumber,
          season_number: episodesTable.seasonNumber,
          still_path: episodesTable.stillPath,
          runtime: episodesTable.runtimeMinutes,
        })
        .from(episodesTable)
        .where(
          and(
            eq(episodesTable.titleId, title.id),
            eq(episodesTable.seasonNumber, seasonNumber),
          ),
        )
        .orderBy(asc(episodesTable.episodeNumber))
        .all();

      if (dbEpisodes.length > 0) {
        tmdb = {
          id: 0,
          name: `Season ${seasonNumber}`,
          overview: "",
          air_date: dbEpisodes[0].air_date ?? null,
          poster_path: null,
          season_number: seasonNumber,
          vote_average: 0,
          episodes: dbEpisodes.map((ep) => ({
            id: ep.id,
            name: ep.name ?? `Episode ${ep.episode_number}`,
            overview: ep.overview ?? "",
            air_date: ep.air_date ?? null,
            episode_number: ep.episode_number,
            season_number: ep.season_number,
            still_path: ep.still_path ?? null,
            runtime: ep.runtime,
            vote_average: 0,
            guest_stars: [],
            crew: [],
          })),
          credits: { cast: [], crew: [] },
        };

        // Build seasons list from distinct season numbers in the DB
        if (seasons.length === 0) {
          const seasonRows = await db.all<{ season_number: number }>(sql`
            SELECT DISTINCT season_number
            FROM episodes
            WHERE title_id = ${title.id}
            ORDER BY season_number ASC
          `);
          seasons = seasonRows.map((s) => ({
            season_number: s.season_number,
            name: `Season ${s.season_number}`,
            episode_count: 0,
            air_date: null,
            poster_path: null,
          }));
        }
      }
    }

    setPublicCacheIfAnon(c, 3600);
    return ok(c, { title, tmdb, seasonNumber, country, seasons });
  },
);

app.get(
  "/show/:id/season/:season/episode/:episode",
  zValidator("param", episodeParam),
  async (c) => {
    const user = c.get("user");
    const title = await getOrFetchTitle(c.req.param("id"), user?.id);
    if (!title) return err(c, "Title not found", 404);

    const { season: seasonNumber, episode: episodeNumber } =
      c.req.valid("param");

    let tmdb = null;
    if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
      try {
        tmdb = await fetchEpisodeDetails(
          title.tmdb_id,
          seasonNumber,
          episodeNumber,
        );
        if (tmdb)
          await upsertEpisodes([
            {
              title_id: title.id,
              season_number: tmdb.season_number,
              episode_number: tmdb.episode_number,
              name: tmdb.name,
              overview: tmdb.overview,
              air_date: tmdb.air_date,
              still_path: tmdb.still_path,
              runtime_minutes: tmdb.runtime,
            },
          ]);
      } catch (e) {
        log.error("TMDB episode fetch failed", {
          tmdbId: title.tmdb_id,
          season: seasonNumber,
          episode: episodeNumber,
          err: e,
        });
      }
    }

    // Fallback: when TMDB is unavailable, build a minimal episode response
    // from the local episodes table so the episode detail page can render.
    if (!tmdb) {
      const db = getDb();
      const dbEp = await db
        .select({
          id: episodesTable.id,
          name: episodesTable.name,
          overview: episodesTable.overview,
          air_date: episodesTable.airDate,
          episode_number: episodesTable.episodeNumber,
          season_number: episodesTable.seasonNumber,
          still_path: episodesTable.stillPath,
          runtime: episodesTable.runtimeMinutes,
        })
        .from(episodesTable)
        .where(
          and(
            eq(episodesTable.titleId, title.id),
            eq(episodesTable.seasonNumber, seasonNumber),
            eq(episodesTable.episodeNumber, episodeNumber),
          ),
        )
        .get();

      if (dbEp) {
        tmdb = {
          id: dbEp.id,
          name: dbEp.name ?? `Episode ${episodeNumber}`,
          overview: dbEp.overview ?? "",
          air_date: dbEp.air_date ?? null,
          episode_number: dbEp.episode_number,
          season_number: dbEp.season_number,
          still_path: dbEp.still_path ?? null,
          runtime: dbEp.runtime,
          vote_average: 0,
          vote_count: 0,
          guest_stars: [],
          crew: [],
          credits: { cast: [], crew: [] },
        };
      }
    }

    return ok(c, { title, tmdb, seasonNumber, episodeNumber, country });
  },
);

app.get("/person/:personId", zValidator("param", personIdParam), async (c) => {
  const personId = c.req.valid("param").personId;

  if (!CONFIG.TMDB_API_KEY) {
    return err(c, "TMDB not configured", 503);
  }

  let person: TmdbPersonDetails;
  try {
    person = await fetchPersonDetails(personId);
  } catch (e) {
    log[isTmdbNotFound(e) ? "warn" : "error"]("TMDB person fetch failed", {
      personId,
      err: e,
    });
    if (isTmdbNotFound(e)) {
      return err(c, "Person not found", 404);
    }
    return err(c, "Failed to fetch person", 503);
  }

  const user = c.get("user");
  const [is_following, library] = user
    ? await Promise.all([
        isFollowingPerson(user.id, personId),
        getTrackedTitleIds(user.id),
      ])
    : [false, new Set<string>()];

  setPublicCacheIfAnon(c, 3600);
  return ok(c, { person: slimPerson(person, library), is_following });
});

/** Credit fields the Person page reads; TMDB sends ~4x more per credit. */
function slimCredit<T extends TmdbPersonCastCredit | TmdbPersonCrewCredit>(
  credit: T,
  library: Set<string>,
) {
  const role =
    "character" in credit
      ? { character: credit.character ?? "" }
      : { job: credit.job };
  return {
    id: credit.id,
    media_type: credit.media_type,
    title: credit.title,
    name: credit.name,
    ...role,
    release_date: credit.release_date,
    first_air_date: credit.first_air_date,
    poster_path: credit.poster_path,
    vote_count: credit.vote_count ?? 0,
    popularity: credit.popularity ?? 0,
    episode_count: credit.episode_count,
    in_library: library.has(`${credit.media_type}-${credit.id}`),
  };
}

function slimPerson(person: TmdbPersonDetails, library: Set<string>) {
  const ids = person.external_ids;
  return {
    id: person.id,
    name: person.name,
    biography: person.biography,
    birthday: person.birthday,
    deathday: person.deathday,
    place_of_birth: person.place_of_birth,
    known_for_department: person.known_for_department,
    profile_path: person.profile_path,
    external_ids: {
      imdb_id: ids?.imdb_id ?? null,
      instagram_id: ids?.instagram_id ?? null,
      twitter_id: ids?.twitter_id ?? null,
      facebook_id: ids?.facebook_id ?? null,
    },
    combined_credits: {
      cast: (person.combined_credits?.cast ?? []).map((c) =>
        slimCredit(c, library),
      ),
      crew: (person.combined_credits?.crew ?? []).map((c) =>
        slimCredit(c, library),
      ),
    },
  };
}

app.get(
  "/movie/:id/suggestions",
  zValidator("param", titleIdParam),
  zValidator("query", suggestionsQuery),
  async (c) => {
    const parsed = parseTitleId(c.req.param("id"));
    if (!parsed || parsed.type !== "MOVIE")
      return err(c, "Invalid title ID", 400);
    if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

    const page = c.req.valid("query").page;

    try {
      const [data, genreMap] = await Promise.all([
        fetchMovieSuggestions(parsed.tmdbId, page),
        getMovieGenres(),
      ]);
      const titles = data.results.map((r) => parseDiscoverMovie(r, genreMap));
      setPublicCacheIfAnon(c, 1800);
      return ok(c, {
        titles,
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
      });
    } catch (e) {
      log.error("TMDB movie suggestions fetch failed", {
        tmdbId: parsed.tmdbId,
        err: e,
      });
      return err(c, "Failed to fetch suggestions", 503);
    }
  },
);

app.get(
  "/show/:id/suggestions",
  zValidator("param", titleIdParam),
  zValidator("query", suggestionsQuery),
  async (c) => {
    const parsed = parseTitleId(c.req.param("id"));
    if (!parsed || parsed.type !== "SHOW")
      return err(c, "Invalid title ID", 400);
    if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

    const page = c.req.valid("query").page;

    try {
      const [data, genreMap] = await Promise.all([
        fetchTvSuggestions(parsed.tmdbId, page),
        getTvGenres(),
      ]);
      const titles = data.results.map((r) => parseDiscoverTv(r, genreMap));
      setPublicCacheIfAnon(c, 1800);
      return ok(c, {
        titles,
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
      });
    } catch (e) {
      log.error("TMDB show suggestions fetch failed", {
        tmdbId: parsed.tmdbId,
        err: e,
      });
      return err(c, "Failed to fetch suggestions", 503);
    }
  },
);

app.get(
  "/collection/:id",
  zValidator("param", collectionIdParam),
  async (c) => {
    if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);
    const { id } = c.req.valid("param");
    try {
      const collection = await fetchCollection(id);
      setPublicCacheIfAnon(c, 3600);
      return c.json(collection);
    } catch (e) {
      log.error("TMDB collection fetch failed", { collectionId: id, err: e });
      return err(c, "Collection not found", 404);
    }
  },
);

export default app;
