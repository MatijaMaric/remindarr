import type { ReactNode } from "react";
import type { MovieDetailsResponse, Title } from "../../types";
import TrackButton from "../TrackButton";
import VisibilityButton from "../VisibilityButton";
import WatchButtonGroup from "../WatchButtonGroup";
import { Chip, Kicker } from "../design";
import { RatingBadge } from "./RatingBadge";
import { TMDB_IMG, formatRuntime } from "./utils";

export interface MovieHeroProps {
  title: Title;
  tmdb: MovieDetailsResponse["tmdb"];
  /** Renders the watched-toggle + watch history button group. */
  watchedActions: ReactNode;
  /** Optional watch-history disclosure (rendered below the action row). */
  watchHistoryPanel: ReactNode;
}

export default function MovieHero({ title, tmdb, watchedActions, watchHistoryPanel }: MovieHeroProps) {
  const genres = tmdb?.genres?.map((g) => g.name) || title.genres;
  const certification = title.age_certification;
  const backdropUrl = tmdb?.backdrop_path ? `${TMDB_IMG}/w1280${tmdb.backdrop_path}` : null;
  const posterUrl = tmdb?.poster_path ? `${TMDB_IMG}/w500${tmdb.poster_path}` : title.poster_url;
  const displayTitle = tmdb?.title || title.title;
  const originalTitle = tmdb?.original_title || title.original_title;

  return (
    <div
      className="relative -mx-4 -mt-6 px-4 pt-6 pb-8 sm:px-8 sm:pt-10 sm:pb-10 lg:px-16 lg:pt-14 lg:pb-12 dark-section"
      style={
        backdropUrl
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(3,7,18,0.6), rgba(3,7,18,1)), url(${backdropUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
            }
          : undefined
      }
    >
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 lg:gap-10 items-end">
        {/* Poster */}
        <div className="w-48 sm:w-56 lg:w-60 shrink-0 mx-auto sm:mx-0">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={title.title}
              className="w-full rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.7)] border border-white/[0.08]"
            />
          ) : (
            <div className="aspect-[2/3] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 border border-white/[0.08]">
              No poster
            </div>
          )}
        </div>

        {/* Title info */}
        <div className="flex-1 space-y-3 max-w-[820px]">
          <div>
            {tmdb?.tagline && <p className="text-sm text-amber-400 italic mb-1">{tmdb.tagline}</p>}
            <Kicker className="mb-2">
              Movie{title.release_year ? ` · ${title.release_year}` : ""}
              {title.offers[0]?.provider_name ? ` · ${title.offers[0].provider_name}` : ""}
            </Kicker>
            <h1 className="text-[30px] sm:text-[56px] lg:text-[64px] leading-none tracking-[-0.035em] font-extrabold text-white">
              {displayTitle}
            </h1>
            {originalTitle && originalTitle !== displayTitle && (
              <p className="text-sm text-zinc-400 mt-1">{originalTitle}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            {title.release_year && <span>{title.release_year}</span>}
            {(title.runtime_minutes || tmdb?.runtime) && (
              <>
                <span className="text-zinc-600">·</span>
                <span>{formatRuntime(tmdb?.runtime || title.runtime_minutes)}</span>
              </>
            )}
            {certification && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="border border-white/[0.10] px-1.5 py-0.5 rounded text-xs">{certification}</span>
              </>
            )}
            {tmdb?.status && (
              <>
                <span className="text-zinc-600">·</span>
                <span>{tmdb.status}</span>
              </>
            )}
          </div>

          {(genres.length > 0 || title.imdb_score) && (
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <Chip key={g} variant="default">
                  {g}
                </Chip>
              ))}
              {title.imdb_score && <Chip variant="amber">★ {title.imdb_score.toFixed(1)}</Chip>}
            </div>
          )}

          {/* Ratings */}
          <div className="flex items-center gap-6 pt-2">
            <RatingBadge label="IMDb" score={title.imdb_score} />
            <RatingBadge label="TMDB" score={tmdb?.vote_average ?? title.tmdb_score} />
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <TrackButton titleId={title.id} isTracked={title.is_tracked} titleData={title} />
            <VisibilityButton
              titleId={title.id}
              isPublic={title.is_public ?? true}
              isTracked={title.is_tracked}
            />
            {watchedActions}
            <WatchButtonGroup offers={title.offers} variant="inline" maxVisible={3} />
          </div>
          {watchHistoryPanel}
        </div>
      </div>
    </div>
  );
}
