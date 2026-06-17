import { Link } from "react-router";
import FullBleedCarousel from "./FullBleedCarousel";
import { MediaCard } from "./MediaCard";
import { Kicker } from "./design";
import type { TrendingTitle, TrendingPerson } from "../types";

interface TrendingSectionProps {
  movies: TrendingTitle[];
  shows: TrendingTitle[];
  people: TrendingPerson[];
  isLoading?: boolean;
}

function TitleCardItem({ title }: { title: TrendingTitle }) {
  return (
    <div className="w-44 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
      <MediaCard
        aspect="poster"
        to={`/title/${title.id}`}
        imageUrl={title.posterUrl}
        imageAlt={title.title}
        title={title.title}
        titleClamp={2}
        badge={
          title.isTracked
            ? { label: "Tracking", tone: "accent", position: "top-left" }
            : {
                label: title.objectType === "MOVIE" ? "Movie" : "TV",
                tone: "neutral",
                position: "top-left",
              }
        }
      />
    </div>
  );
}

/**
 * People render as circular avatar cards — visually distinct from the poster
 * title cards (FR-004) — linking to the existing person detail page (FR-006).
 */
function PersonCardItem({ person }: { person: TrendingPerson }) {
  return (
    <Link
      to={`/person/${person.id}`}
      className="group w-32 flex-shrink-0 text-center"
      style={{ scrollSnapAlign: "start" }}
    >
      <div className="mx-auto mb-2 h-28 w-28 overflow-hidden rounded-full bg-zinc-800 transition-all group-hover:ring-2 group-hover:ring-amber-400">
        {person.profileUrl ? (
          <img
            src={person.profileUrl}
            alt={person.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950 text-3xl text-zinc-500">
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <p className="truncate text-sm font-medium text-white transition-colors group-hover:text-amber-400">
        {person.name}
      </p>
      {person.knownForDepartment && (
        <p className="truncate text-xs text-zinc-400">
          {person.knownForDepartment}
        </p>
      )}
    </Link>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
      {children}
    </h3>
  );
}

export default function TrendingSection({
  movies,
  shows,
  people,
  isLoading = false,
}: TrendingSectionProps) {
  const hasAny = movies.length > 0 || shows.length > 0 || people.length > 0;

  // Non-blocking loading placeholder (FR-009). Rendered alongside other home
  // sections — it never delays them.
  if (isLoading && !hasAny) {
    return (
      <section aria-label="Trending" aria-busy="true">
        <div className="mb-4">
          <Kicker>Trending</Kicker>
          <h2 className="text-xl font-bold tracking-[-0.01em]">Trending Now</h2>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-44 flex-shrink-0 animate-pulse rounded-xl bg-zinc-800/60"
            />
          ))}
        </div>
      </section>
    );
  }

  // Hide the whole section when there is nothing to show (FR-008 fail-soft /
  // FR-013 empty groups).
  if (!hasAny) return null;

  return (
    <section aria-label="Trending">
      <div className="mb-4">
        <Kicker>Trending</Kicker>
        <h2 className="text-xl font-bold tracking-[-0.01em]">Trending Now</h2>
      </div>
      <div className="space-y-6">
        {movies.length > 0 && (
          <div>
            <GroupHeading>Movies</GroupHeading>
            <FullBleedCarousel>
              {movies.map((m) => (
                <TitleCardItem key={m.id} title={m} />
              ))}
            </FullBleedCarousel>
          </div>
        )}
        {shows.length > 0 && (
          <div>
            <GroupHeading>TV Shows</GroupHeading>
            <FullBleedCarousel>
              {shows.map((s) => (
                <TitleCardItem key={s.id} title={s} />
              ))}
            </FullBleedCarousel>
          </div>
        )}
        {people.length > 0 && (
          <div>
            <GroupHeading>People</GroupHeading>
            <FullBleedCarousel>
              {people.map((p) => (
                <PersonCardItem key={p.id} person={p} />
              ))}
            </FullBleedCarousel>
          </div>
        )}
      </div>
    </section>
  );
}
