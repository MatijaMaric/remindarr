import { useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import * as api from "../api";
import ScrollableRow from "../components/ScrollableRow";
import type { PersonCastCredit, PersonCrewCredit } from "../types";
import ExternalLinks from "../components/ExternalLinks";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useQuery } from "@tanstack/react-query";
import { profileUrl, posterUrl as mkPosterUrl } from "../lib/tmdb-images";
import { formatDate } from "../components/title-detail/utils";

const BIO_TRUNCATE_LENGTH = 600;

function getYear(dateStr?: string): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 4);
}

function creditTitle(credit: PersonCastCredit | PersonCrewCredit): string {
  return credit.title || credit.name || "Untitled";
}

function creditTitleId(credit: PersonCastCredit | PersonCrewCredit): string {
  return credit.media_type === "movie"
    ? `movie-${credit.id}`
    : `tv-${credit.id}`;
}

function creditSubtitle(credit: PersonCastCredit | PersonCrewCredit): string {
  return "character" in credit ? credit.character : credit.job;
}

/** Max number of titles shown in the "Known For" row. */
export const KNOWN_FOR_LIMIT = 10;

/**
 * Selects a person's most notable titles for the "Known For" row: merges the
 * already-combined cast + crew credits, ranks by `popularity` descending,
 * de-duplicates by the `${media_type}-${id}` title key (keeping the
 * highest-popularity occurrence so a title held in multiple roles appears
 * once), and caps the result at `limit`. Pure — no padding, no fabrication.
 */
export function selectKnownFor(
  credits: (PersonCastCredit | PersonCrewCredit)[],
  limit = KNOWN_FOR_LIMIT,
): (PersonCastCredit | PersonCrewCredit)[] {
  const sorted = [...credits].sort((a, b) => b.popularity - a.popularity);
  const seen = new Set<string>();
  const result: (PersonCastCredit | PersonCrewCredit)[] = [];
  for (const credit of sorted) {
    const key = creditTitleId(credit);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(credit);
    if (result.length >= limit) break;
  }
  return result;
}

function deduplicateCast(credits: PersonCastCredit[]): PersonCastCredit[] {
  const seen = new Set<number>();
  return credits.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function deduplicateCrew(credits: PersonCrewCredit[]): PersonCrewCredit[] {
  const seen = new Set<string>();
  return credits.filter((c) => {
    const key = `${c.id}-${c.job}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function CreditCard({
  credit,
  subtitle,
}: {
  credit: PersonCastCredit | PersonCrewCredit;
  subtitle: string;
}) {
  return (
    <Link
      to={`/title/${creditTitleId(credit)}`}
      className="flex-shrink-0 w-32 sm:w-36 group"
    >
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
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
          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-sm px-2 text-center">
            {creditTitle(credit)}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate group-hover:text-amber-400 transition-colors">
        {creditTitle(credit)}
      </p>
      <p className="text-xs text-zinc-400 truncate">{subtitle}</p>
      {getYear(credit.release_date || credit.first_air_date) && (
        <p className="text-xs text-zinc-500">
          {getYear(credit.release_date || credit.first_air_date)}
        </p>
      )}
    </Link>
  );
}

export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  const [bioExpanded, setBioExpanded] = useState(false);

  const {
    data,
    isLoading: loading,
    isError: error,
  } = useQuery({
    queryKey: ["person", personId],
    queryFn: ({ signal }) => api.getPersonDetails(Number(personId), signal),
    enabled: !!personId,
  });

  const cast = data?.person.combined_credits.cast;
  const crew = data?.person.combined_credits.crew;
  const knownForCredits = useMemo(
    () => selectKnownFor([...(cast ?? []), ...(crew ?? [])]),
    [cast, crew],
  );

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">Person not found</div>
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

  const castCredits = deduplicateCast(
    [...person.combined_credits.cast].sort(
      (a, b) => b.popularity - a.popularity,
    ),
  );
  const crewCredits = deduplicateCrew(
    [...person.combined_credits.crew].sort(
      (a, b) => b.popularity - a.popularity,
    ),
  );

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0">
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-zinc-800">
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
              <div className="w-full h-full flex items-center justify-center text-zinc-300 text-5xl">
                {person.name.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-white select-text">
            {person.name}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm">
            {person.known_for_department && (
              <span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
                {person.known_for_department}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400">
            {person.birthday && (
              <div>
                <span className="text-zinc-400">Born: </span>
                <span>{formatDate(person.birthday)}</span>
              </div>
            )}
            {person.deathday && (
              <div>
                <span className="text-zinc-400">Died: </span>
                <span>{formatDate(person.deathday)}</span>
              </div>
            )}
            {person.place_of_birth && (
              <div>
                <span className="text-zinc-400">From: </span>
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
          <h2 className="text-lg font-semibold text-white">Biography</h2>
          <p className="text-zinc-300 leading-relaxed whitespace-pre-line select-text">
            {displayBio}
          </p>
          {showBioToggle && (
            <button
              onClick={() => setBioExpanded(!bioExpanded)}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}

      {/* Known For */}
      {knownForCredits.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Known For</h2>
          <ScrollableRow className="gap-4 pb-2">
            {knownForCredits.map((c) => (
              <CreditCard
                key={creditTitleId(c)}
                credit={c}
                subtitle={creditSubtitle(c)}
              />
            ))}
          </ScrollableRow>
        </section>
      )}

      {/* Acting Credits */}
      {castCredits.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Acting ({castCredits.length})
          </h2>
          <ScrollableRow className="gap-4 pb-2">
            {castCredits.map((c) => (
              <CreditCard
                key={`cast-${c.id}-${c.character}`}
                credit={c}
                subtitle={c.character}
              />
            ))}
          </ScrollableRow>
        </section>
      )}

      {/* Crew Credits */}
      {crewCredits.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Crew ({crewCredits.length})
          </h2>
          <ScrollableRow className="gap-4 pb-2">
            {crewCredits.map((c) => (
              <CreditCard
                key={`crew-${c.id}-${c.job}`}
                credit={c}
                subtitle={c.job}
              />
            ))}
          </ScrollableRow>
        </section>
      )}
    </div>
  );
}
