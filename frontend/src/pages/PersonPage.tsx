import { useState } from "react";
import { useParams, Link } from "react-router";
import * as api from "../api";
import ScrollableRow from "../components/ScrollableRow";
import type { PersonDetailsResponse, PersonCastCredit, PersonCrewCredit } from "../types";
import ExternalLinks from "../components/ExternalLinks";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const BIO_TRUNCATE_LENGTH = 600;

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getYear(dateStr?: string): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 4);
}

function creditTitle(credit: PersonCastCredit | PersonCrewCredit): string {
  return credit.title || credit.name || "Untitled";
}

function creditTitleId(credit: PersonCastCredit | PersonCrewCredit): string {
  return credit.media_type === "movie" ? `movie-${credit.id}` : `tv-${credit.id}`;
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

function CreditCard({ credit, subtitle }: { credit: PersonCastCredit | PersonCrewCredit; subtitle: string }) {
  return (
    <Link
      to={`/title/${creditTitleId(credit)}`}
      className="flex-shrink-0 w-32 sm:w-36 group"
    >
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
        {credit.poster_path ? (
          <img
            src={`${TMDB_IMG}/w342${credit.poster_path}`}
            alt={creditTitle(credit)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm px-2 text-center">
            {creditTitle(credit)}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate group-hover:text-amber-400 transition-colors">
        {creditTitle(credit)}
      </p>
      <p className="text-xs text-zinc-400 truncate">{subtitle}</p>
      {getYear(credit.release_date || credit.first_air_date) && (
        <p className="text-xs text-zinc-500">{getYear(credit.release_date || credit.first_air_date)}</p>
      )}
    </Link>
  );
}

export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  const [bioExpanded, setBioExpanded] = useState(false);

  const { data, loading, error } = useApiCall<PersonDetailsResponse>(
    () => api.getPersonDetails(Number(personId)),
    [personId],
  );

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error || "Person not found"}</div>
      </div>
    );
  }

  const { person } = data;
  const biography = person.biography || "";
  const showBioToggle = biography.length > BIO_TRUNCATE_LENGTH;
  const displayBio = bioExpanded || !showBioToggle ? biography : biography.slice(0, BIO_TRUNCATE_LENGTH) + "...";

  const castCredits = deduplicateCast(
    [...person.combined_credits.cast].sort((a, b) => b.popularity - a.popularity)
  );
  const crewCredits = deduplicateCrew(
    [...person.combined_credits.crew].sort((a, b) => b.popularity - a.popularity)
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0">
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-zinc-800">
            {person.profile_path ? (
              <img
                src={`${TMDB_IMG}/w300${person.profile_path}`}
                alt={person.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-5xl">
                {person.name.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{person.name}</h1>
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
                <span className="text-zinc-500">Born: </span>
                <span>{formatDate(person.birthday)}</span>
              </div>
            )}
            {person.deathday && (
              <div>
                <span className="text-zinc-500">Died: </span>
                <span>{formatDate(person.deathday)}</span>
              </div>
            )}
            {person.place_of_birth && (
              <div>
                <span className="text-zinc-500">From: </span>
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
          <p className="text-zinc-300 leading-relaxed whitespace-pre-line">{displayBio}</p>
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

      {/* Acting Credits */}
      {castCredits.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Acting ({castCredits.length})</h2>
          <ScrollableRow className="gap-4 pb-2">
            {castCredits.map((c) => (
              <CreditCard key={`cast-${c.id}-${c.character}`} credit={c} subtitle={c.character} />
            ))}
          </ScrollableRow>
        </section>
      )}

      {/* Crew Credits */}
      {crewCredits.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Crew ({crewCredits.length})</h2>
          <ScrollableRow className="gap-4 pb-2">
            {crewCredits.map((c) => (
              <CreditCard key={`crew-${c.id}-${c.job}`} credit={c} subtitle={c.job} />
            ))}
          </ScrollableRow>
        </section>
      )}
    </div>
  );
}
