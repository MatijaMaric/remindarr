import { Hono } from "hono";
import { inArray, eq } from "drizzle-orm";
import {
  getUserByUsername,
  getTrackedTitleIds,
  getPublicTrackedTitles,
  getOffersForTitles,
  areMutualFollowers,
  getUserRating,
} from "../db/repository";
import { getDb } from "../db/schema";
import { titles, scores, users } from "../db/schema";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { logger } from "../logger";

const log = logger.child({ module: "overlap" });

const app = new Hono<AppEnv>();

type Offer = {
  id: number;
  title_id: string | null;
  provider_id: number | null;
  monetization_type: string | null;
  presentation_type: string | null;
  price_value: number | null;
  price_currency: string | null;
  url: string;
  available_to: string | null;
  provider_name: string | null;
  provider_technical_name: string | null;
  provider_icon_url: string | null;
};

type SharedProvider = {
  id: number;
  name: string;
  technical_name: string;
  icon_url: string;
};

// GET /overlap/:friendUsername — requires auth (wired in index.ts / worker.ts)
app.get("/:friendUsername", async (c) => {
  const viewer = c.get("user")!;
  const friendUsername = c.req.param("friendUsername");

  // 1. Look up the friend
  const friendUser = await getUserByUsername(friendUsername);
  if (!friendUser) {
    return err(c, "User not found", 404);
  }

  const viewerId = viewer.id;
  const friendId = friendUser.id;

  // 2. Visibility check — replicate server/routes/profile.ts visibility ladder
  const isSelf = viewerId === friendId;

  if (!isSelf) {
    const visibility = (friendUser.profile_visibility ?? "private") as "public" | "friends_only" | "private";
    if (visibility === "private") {
      return err(c, "This user's watchlist is private", 403);
    }
    if (visibility === "friends_only") {
      const mutual = await areMutualFollowers(viewerId, friendId);
      if (!mutual) {
        return err(c, "This user's watchlist is only visible to mutual followers", 403);
      }
    }
    // "public" — allow
  }

  // 3. Get tracked title IDs for both users
  const viewerIds = await getTrackedTitleIds(viewerId);

  let friendIds: Set<string>;
  if (isSelf) {
    friendIds = new Set(viewerIds);
  } else {
    const isMutual = await areMutualFollowers(viewerId, friendId);
    if (isMutual) {
      friendIds = await getTrackedTitleIds(friendId);
    } else {
      // Public profile — only public titles
      const publicTitles = await getPublicTrackedTitles(friendId);
      friendIds = new Set(publicTitles.map((t) => t.id));
    }
  }

  // 4. Compute intersection
  const intersectionIds: string[] = [];
  for (const id of viewerIds) {
    if (friendIds.has(id)) {
      intersectionIds.push(id);
    }
  }

  const counts = {
    intersection: intersectionIds.length,
    viewerOnly: viewerIds.size - intersectionIds.length,
    friendOnly: friendIds.size - intersectionIds.length,
  };

  log.info("Overlap computed", {
    viewerId,
    friendId,
    intersection: counts.intersection,
    viewerOnly: counts.viewerOnly,
    friendOnly: counts.friendOnly,
  });

  // Look up friend's image
  const db = getDb();
  const friendRow = await db
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, friendId))
    .get();

  if (intersectionIds.length === 0) {
    return ok(c, {
      titles: [] as unknown[],
      sharedProviders: [] as SharedProvider[],
      counts,
      friendUser: {
        username: friendUser.username,
        displayName: friendUser.display_name,
        image: friendRow?.image ?? null,
      },
    });
  }

  // 5. Get full title details for intersection
  const titleRows = await db
    .select({
      id: titles.id,
      object_type: titles.objectType,
      title: titles.title,
      original_title: titles.originalTitle,
      release_year: titles.releaseYear,
      release_date: titles.releaseDate,
      runtime_minutes: titles.runtimeMinutes,
      short_description: titles.shortDescription,
      poster_url: titles.posterUrl,
      age_certification: titles.ageCertification,
      original_language: titles.originalLanguage,
      tmdb_url: titles.tmdbUrl,
      imdb_id: titles.imdbId,
      tmdb_id: titles.tmdbId,
      tmdb_score: scores.tmdbScore,
      imdb_score: scores.imdbScore,
      imdb_votes: scores.imdbVotes,
    })
    .from(titles)
    .leftJoin(scores, eq(scores.titleId, titles.id))
    .where(inArray(titles.id, intersectionIds))
    .all();

  // 6. Load offers for the intersection
  const offersByTitle = await getOffersForTitles(intersectionIds);

  // 7. Compute shared providers — flatrate offers across each user's FULL tracked set
  //    so we derive "you're both on Netflix" even for non-intersection titles.
  const [viewerAllOffers, friendAllOffers] = await Promise.all([
    getOffersForTitles([...viewerIds]),
    getOffersForTitles([...friendIds]),
  ]);

  const viewerFlatrateProviderIds = new Set<number>();
  for (const offerList of viewerAllOffers.values()) {
    for (const o of offerList) {
      if (o.monetization_type === "flatrate" && o.provider_id !== null) {
        viewerFlatrateProviderIds.add(o.provider_id);
      }
    }
  }

  const friendFlatrateProviderIds = new Set<number>();
  for (const offerList of friendAllOffers.values()) {
    for (const o of offerList) {
      if (o.monetization_type === "flatrate" && o.provider_id !== null) {
        friendFlatrateProviderIds.add(o.provider_id);
      }
    }
  }

  const sharedProviderIdSet = new Set<number>();
  for (const id of viewerFlatrateProviderIds) {
    if (friendFlatrateProviderIds.has(id)) {
      sharedProviderIdSet.add(id);
    }
  }

  // Build unique provider objects from offers appearing on intersection titles
  const seenProviderIds = new Set<number>();
  const sharedProviders: SharedProvider[] = [];

  for (const offerList of offersByTitle.values()) {
    for (const o of offerList) {
      if (
        o.provider_id !== null &&
        sharedProviderIdSet.has(o.provider_id) &&
        !seenProviderIds.has(o.provider_id)
      ) {
        seenProviderIds.add(o.provider_id);
        sharedProviders.push({
          id: o.provider_id,
          name: o.provider_name ?? "",
          technical_name: o.provider_technical_name ?? "",
          icon_url: o.provider_icon_url ?? "",
        });
      }
    }
  }

  // 8. Ratings for both users across intersection
  const [viewerRatings, friendRatings] = await Promise.all([
    Promise.all(intersectionIds.map((id) => getUserRating(viewerId, id).then((r) => [id, r] as const))),
    Promise.all(intersectionIds.map((id) => getUserRating(friendId, id).then((r) => [id, r] as const))),
  ]);

  const viewerRatingMap = new Map(viewerRatings);
  const friendRatingMap = new Map(friendRatings);

  const ratingScore = (r: string | null): number => {
    if (r === "LOVE") return 4;
    if (r === "LIKE") return 3;
    if (r === "DISLIKE") return 2;
    if (r === "HATE") return 1;
    return 0;
  };

  // Build title response with offers + ratings, sort by combined score descending
  const titlesWithDetails = titleRows.map((row) => {
    const titleOffers = (offersByTitle.get(row.id) ?? []) as Offer[];
    return {
      id: row.id,
      object_type: row.object_type as string,
      title: row.title as string,
      original_title: row.original_title,
      release_year: row.release_year,
      release_date: row.release_date,
      runtime_minutes: row.runtime_minutes,
      short_description: row.short_description,
      poster_url: row.poster_url,
      age_certification: row.age_certification,
      original_language: row.original_language,
      tmdb_url: row.tmdb_url,
      imdb_id: row.imdb_id,
      tmdb_id: row.tmdb_id,
      tmdb_score: row.tmdb_score,
      imdb_score: row.imdb_score,
      imdb_votes: row.imdb_votes,
      is_tracked: true as const,
      genres: [] as string[],
      offers: titleOffers,
      viewer_rating: viewerRatingMap.get(row.id) ?? null,
      friend_rating: friendRatingMap.get(row.id) ?? null,
      _sort_score:
        ratingScore(viewerRatingMap.get(row.id) ?? null) +
        ratingScore(friendRatingMap.get(row.id) ?? null) +
        (row.tmdb_score ?? 0) / 10,
    };
  });

  titlesWithDetails.sort((a, b) => b._sort_score - a._sort_score);

  const titlesOut = titlesWithDetails.map(({ _sort_score: _s, ...rest }) => rest);

  return ok(c, {
    titles: titlesOut,
    sharedProviders,
    counts,
    friendUser: {
      username: friendUser.username,
      displayName: friendUser.display_name,
      image: friendRow?.image ?? null,
    },
  });
});

export default app;
