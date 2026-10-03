import { logger } from "../logger";
import { CONFIG } from "../config";
import { fetchPersonDetails } from "../tmdb/client";
import type { TmdbPersonDetails } from "../tmdb/types";
import {
  getEnabledNotifierIdsForPersonFollowers,
  getPersonFollowers,
  insertPersonCreditAlerts,
  listFollowedPersonIds,
  updatePersonFollow,
  type PersonCreditAlert,
} from "../db/repository/person-follows";
import { enqueueAdhoc } from "./backend";

const log = logger.child({ module: "person-credits" });

// TMDB TV genres that never count as a New credit (guest spots on talk/news shows).
const EXCLUDED_GENRES = new Set([10767, 10763]);
const RECENT_DAYS = 30;

interface Credit {
  key: string;
  title: string;
  role: string | null;
  releaseDate: string | null;
  posterPath: string | null;
  genreIds: number[];
}

/** Every credit of a person, one per title (first role wins). */
export function collectCredits(person: TmdbPersonDetails): Map<string, Credit> {
  const credits = new Map<string, Credit>();
  const all = [
    ...person.combined_credits.cast.map((c) => ({ ...c, role: c.character })),
    ...person.combined_credits.crew.map((c) => ({ ...c, role: c.job })),
  ];
  for (const c of all) {
    const key = `${c.media_type}:${c.id}`;
    if (credits.has(key)) continue;
    credits.set(key, {
      key,
      title: c.title ?? c.name ?? "",
      role: c.role || null,
      releaseDate: c.release_date || c.first_air_date || null,
      posterPath: c.poster_path,
      genreIds: c.genre_ids ?? [],
    });
  }
  return credits;
}

/** Undated, upcoming, or released within the last 30 days; never talk/news. */
export function isNotifiable(credit: Credit, now = new Date()): boolean {
  if (credit.genreIds.some((g) => EXCLUDED_GENRES.has(g))) return false;
  if (!credit.releaseDate) return true;
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return credit.releaseDate >= cutoff;
}

/** Diff one person's TMDB credits against each follower's snapshot. */
export async function checkPersonCredits(personId: number): Promise<void> {
  const followers = await getPersonFollowers(personId);
  if (followers.length === 0) return;

  const person = await fetchPersonDetails(personId);
  const credits = collectCredits(person);
  const notifiersByUser =
    await getEnabledNotifierIdsForPersonFollowers(personId);

  for (const follower of followers) {
    const seen = new Set(follower.seenCredits);
    const fresh: PersonCreditAlert[] = [...credits.values()]
      .filter((c) => !seen.has(c.key) && isNotifiable(c))
      .map((c) => ({
        personId,
        creditKey: c.key,
        personName: person.name,
        title: c.title,
        role: c.role,
        releaseDate: c.releaseDate,
        posterPath: c.posterPath,
      }));
    const notifierIds = notifiersByUser.get(follower.userId) ?? [];
    if (fresh.length > 0 && notifierIds.length > 0) {
      await insertPersonCreditAlerts(notifierIds, fresh);
    }
    // Union keeps a credit TMDB drops and re-adds from alerting twice.
    await updatePersonFollow(follower.userId, personId, {
      name: person.name,
      profilePath: person.profile_path,
      seenCredits: [...new Set([...seen, ...credits.keys()])],
    });
    if (fresh.length > 0) {
      log.info("New credits for followed person", {
        personId,
        userId: follower.userId,
        count: fresh.length,
      });
    }
  }
}

/** Fan out one check-person-credits job per followed person (same unit as sync-show-episodes). */
export async function dispatchPersonCreditChecks(): Promise<void> {
  if (!CONFIG.TMDB_API_KEY) return;
  const personIds = await listFollowedPersonIds();
  for (const personId of personIds) {
    try {
      await enqueueAdhoc(
        "check-person-credits",
        { personId },
        { detachTick: true },
      );
    } catch (err) {
      log.warn("Failed to enqueue person credit check", {
        personId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info("Dispatched person credit checks", { people: personIds.length });
}

export async function handleCheckPersonCredits(
  data: string | null,
): Promise<void> {
  if (!CONFIG.TMDB_API_KEY) return;
  const personId = data ? Number(JSON.parse(data).personId) : NaN;
  if (!Number.isInteger(personId) || personId < 1) {
    throw new Error("check-person-credits job missing personId");
  }
  await checkPersonCredits(personId);
}
