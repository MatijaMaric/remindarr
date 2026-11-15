import { useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import * as api from "../api";
import ScrollableRow from "../components/ScrollableRow";
import type { PersonCastCredit, PersonCrewCredit } from "../types";
import ExternalLinks from "../components/ExternalLinks";
import FollowButton from "../components/FollowButton";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useQuery } from "@tanstack/react-query";
import { profileUrl, posterUrl as mkPosterUrl } from "../lib/tmdb-images";
import { formatDate } from "../components/title-detail/utils";
import { ApiError } from "../lib/api-error";

const BIO_TRUNCATE_LENGTH = 600;

type Credit = PersonCastCredit | PersonCrewCredit;

function creditDate(credit: Credit): string {
  return credit.release_date || credit.first_air_date || "";
}

function creditTitle(credit: Credit): string {
  return credit.title || credit.name || "Untitled";
}

/** `movie-N` / `tv-N`: the title's id in the app, and its identity here. */
export function creditTitleId(credit: Credit): string {
  return credit.media_type === "movie"
    ? `movie-${credit.id}`
    : `tv-${credit.id}`;
}

function creditRole(credit: Credit): string {
  return "character" in credit ? credit.character : credit.job;
}

/** Max number of titles shown in the "Known For" row. */
export const KNOWN_FOR_LIMIT = 10;

/** Cards shown in a filmography row before "Show all". */
export const ROW_LIMIT = 12;

/**
 * True for non-narrative "Self" appearances (talk-show guest/host spots, award
 * shows, etc.). Only cast credits carry `character`; crew credits (which have
 * `job`) are never treated as self-appearances.
 */
export function isSelfAppearance(credit: Credit): boolean {
  if (!("character" in credit)) return false;
  const role = credit.character.trim().toLowerCase();
  return (
    role === "self" ||
    role === "himself" ||
    role === "herself" ||
    role === "themselves" ||
    role.startsWith("self ") ||
    role.startsWith("self-")
  );
}

/**
 * How notable a credit is for "Known For": the title's rating volume
 * (`vote_count`; `popularity` is trending velocity, which lets daily talk shows
 * dominate), shrunk for one-off TV spots and uncredited cameos so a 180-episode
 * lead beats a single guest voice role on a bigger show.
 * ponytail: fixed weights (10 episodes = a regular, uncredited = 1/10), tune
 * here if real people rank oddly.
 */
export function knownForScore(credit: Credit): number {
  let weight = 1;
  if (credit.media_type === "tv" && credit.episode_count != null) {
    weight = Math.min(1, credit.episode_count / 10);
  }
  if (/uncredited/i.test(creditRole(credit))) weight = Math.min(weight, 0.1);
  return (credit.vote_count ?? 0) * weight;
}

/**
 * Selects a person's most notable titles for the "Known For" row. Titles in
 * the viewer's library come first (that is usually why they opened the page),
 * then narrative roles by `knownForScore`, then "Self" appearances, which only
 * fill slots nothing else claims (a farmer or presenter whose show is all
 * they are known for still gets it). De-duplicates by `${media_type}-${id}`,
 * keeping the best-ranked role, and caps at `limit`. No padding.
 */
export function selectKnownFor(
  credits: Credit[],
  limit = KNOWN_FOR_LIMIT,
): Credit[] {
  const tier = (c: Credit) =>
    (c.in_library ? 0 : 2) + (isSelfAppearance(c) ? 1 : 0);
  const sorted = [...credits].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      knownForScore(b) - knownForScore(a) ||
      b.popularity - a.popularity,
  );
  const seen = new Set<string>();
  const result: Credit[] = [];
  for (const credit of sorted) {
    const key = creditTitleId(credit);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(credit);
    if (result.length >= limit) break;
  }
  return result;
}

/** One card: a title with every role the person held on it. */
export interface TitleCredit {
  key: string;
  credit: Credit;
  roles: string;
  /** Every role on the title is a "Self" appearance. */
  self: boolean;
}

/**
 * Collapses credits to one entry per title, joining distinct roles
 * ("Producer · Director") so a title held in several jobs or characters is
 * shown once.
 */
export function mergeByTitle(credits: Credit[]): TitleCredit[] {
  const byKey = new Map<
    string,
    { credit: Credit; roles: string[]; self: boolean }
  >();
  for (const credit of credits) {
    const key = creditTitleId(credit);
    const role = creditRole(credit).trim();
    const entry = byKey.get(key);
    if (!entry) {
      byKey.set(key, {
        credit,
        roles: role ? [role] : [],
        self: isSelfAppearance(credit),
      });
      continue;
    }
    if (role && !entry.roles.includes(role)) entry.roles.push(role);
    entry.self &&= isSelfAppearance(credit);
  }
  return [...byKey].map(([key, e]) => ({
    key,
    credit: e.credit,
    roles: e.roles.join(" · "),
    self: e.self,
  }));
}

/**
 * Filmography order: newest first, undated titles after dated ones, and
 * "Self" appearances (talk shows, award shows) grouped at the end.
 */
export function sortFilmography(titles: TitleCredit[]): TitleCredit[] {
  return [...titles].sort((a, b) => {
    if (a.self !== b.self) return a.self ? 1 : -1;
    const da = creditDate(a.credit);
    const db = creditDate(b.credit);
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    return db.localeCompare(da);
  });
}

function CreditCard({
  credit,
  subtitle,
  className = "flex-shrink-0 w-32 sm:w-36",
}: {
  credit: Credit;
  subtitle: string;
  className?: string;
}) {
  const year = creditDate(credit).substring(0, 4);
  return (
    <Link
      to={`/title/${creditTitleId(credit)}`}
      className={`${className} group`}
    >
      <div className="aspect-[2/3] rounded-md overflow-hidden bg-muted mb-2">
        {credit.poster_path ? (
          <img
            src={mkPosterUrl(credit.poster_path, "w342") ?? ""}
            alt={creditTitle(credit)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
            width={342}
            height={513}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground-secondary text-sm px-2 text-center">
            {creditTitle(credit)}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary-text transition-colors">
        {creditTitle(credit)}
      </p>
      {subtitle && (
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      )}
      {year && <p className="text-xs text-muted-foreground">{year}</p>}
    </Link>
  );
}

/** A filmography row capped at ROW_LIMIT, expandable into a wrapping grid. */
function CreditSection({
  label,
  titles,
}: {
  label: string;
  titles: TitleCredit[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (titles.length === 0) return null;
  const canExpand = titles.length > ROW_LIMIT;
  const cards = (list: TitleCredit[], className?: string) =>
    list.map((t) => (
      <CreditCard
        key={t.key}
        credit={t.credit}
        subtitle={t.roles}
        className={className}
      />
    ));
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {label} ({titles.length})
        </h2>
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="min-h-8 px-2 text-sm text-primary-text hover:underline cursor-pointer"
          >
            {expanded ? "Show fewer" : `Show all ${titles.length}`}
          </button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-4">
          {cards(titles, "w-full")}
        </div>
      ) : (
        <ScrollableRow className="gap-4 pb-2">
          {cards(titles.slice(0, ROW_LIMIT))}
        </ScrollableRow>
      )}
    </section>
  );
}

export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  const [bioExpanded, setBioExpanded] = useState(false);

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["person", personId],
    queryFn: ({ signal }) => api.getPersonDetails(Number(personId), signal),
    enabled: !!personId,
  });

  const cast = data?.person.combined_credits.cast;
  const crew = data?.person.combined_credits.crew;
  const { knownFor, acting, crewTitles } = useMemo(() => {
    const all = [...(cast ?? []), ...(crew ?? [])];
    const distinctTitles = new Set(all.map(creditTitleId)).size;
    return {
      // With this few titles the rows below already show everything.
      knownFor: distinctTitles > KNOWN_FOR_LIMIT ? selectKnownFor(all) : [],
      acting: sortFilmography(mergeByTitle(cast ?? [])),
      crewTitles: sortFilmography(mergeByTitle(crew ?? [])),
    };
  }, [cast, crew]);

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="text-destructive">
          {notFound ? "Person not found" : "Couldn't load this person"}
        </div>
        {!notFound && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-8 px-3 rounded-sm bg-muted text-sm text-foreground hover:bg-muted-hover cursor-pointer"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const { person } = data;
  const biography = person.biography || "";
  const showBioToggle = biography.length > BIO_TRUNCATE_LENGTH;
  const displayBio =
    bioExpanded || !showBioToggle
      ? biography
      : biography.slice(0, BIO_TRUNCATE_LENGTH) + "...";

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0">
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-xl overflow-hidden bg-muted">
            {person.profile_path ? (
              <img
                src={profileUrl(person.profile_path, "w185") ?? ""}
                alt={person.name}
                className="w-full h-full object-cover"
                loading="eager"
                width={185}
                height={278}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-foreground-secondary text-5xl">
                {person.name.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground select-text">
              {person.name}
            </h1>
            <FollowButton
              key={`${person.id}-${data.is_following}`}
              personId={person.id}
              initialIsFollowing={data.is_following ?? false}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {person.known_for_department && (
              <span className="bg-primary-soft text-primary-text px-2 py-0.5 rounded-sm">
                {person.known_for_department}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {person.birthday && (
              <div>
                <span className="text-muted-foreground">Born: </span>
                <span>{formatDate(person.birthday)}</span>
              </div>
            )}
            {person.deathday && (
              <div>
                <span className="text-muted-foreground">Died: </span>
                <span>{formatDate(person.deathday)}</span>
              </div>
            )}
            {person.place_of_birth && (
              <div>
                <span className="text-muted-foreground">From: </span>
                <span>{person.place_of_birth}</span>
              </div>
            )}
          </div>
          <ExternalLinks
            externalIds={person.external_ids}
            tmdbId={person.id}
            type="person"
          />
        </div>
      </div>

      {/* Biography */}
      {biography && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Biography</h2>
          <p className="text-foreground-secondary leading-relaxed whitespace-pre-line select-text">
            {displayBio}
          </p>
          {showBioToggle && (
            <button
              onClick={() => setBioExpanded(!bioExpanded)}
              className="text-sm text-primary-text hover:text-primary-text transition-colors cursor-pointer"
            >
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}

      {/* Known For */}
      {knownFor.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Known For</h2>
          <ScrollableRow className="gap-4 pb-2">
            {knownFor.map((c) => (
              <CreditCard
                key={creditTitleId(c)}
                credit={c}
                subtitle={creditRole(c)}
              />
            ))}
          </ScrollableRow>
        </section>
      )}

      {/* Keyed by person so "Show all" resets when navigating to another person. */}
      <CreditSection
        key={`acting-${person.id}`}
        label="Acting"
        titles={acting}
      />
      <CreditSection
        key={`crew-${person.id}`}
        label="Crew"
        titles={crewTitles}
      />
    </div>
  );
}
