import type { ShowDetailsResponse, Title } from "../../types";
import { useIsMobile } from "../../hooks/useIsMobile";
import TrackButton from "../TrackButton";
import VisibilityButton from "../VisibilityButton";
import WatchButtonGroup from "../WatchButtonGroup";
import { Chip, Kicker } from "../design";
import { NetworkList } from "./NetworkList";
import { RatingBadge } from "./RatingBadge";
import { backdropUrl as mkBackdropUrl, posterUrl as mkPosterUrl } from "../../lib/tmdb-images";
import { getCertification } from "./utils";
import { formatEta } from "../../pages/StatsPage";

export interface ShowHeroProps {
  title: Title;
  tmdb: ShowDetailsResponse["tmdb"];
  country: string;
}

export default function ShowHero({ title, tmdb, country }: ShowHeroProps) {
  const isMobile = useIsMobile();
  const genres = tmdb?.genres?.map((g) => g.name) || title.genres;
  const certification =
    getCertification(tmdb?.content_ratings?.results, country) || title.age_certification;
  const backdropUrl = mkBackdropUrl(tmdb?.backdrop_path, "w1280") ?? null;
  const posterUrl = mkPosterUrl(tmdb?.poster_path, "w500") ?? title.poster_url;
  const firstOfferUrl = title.offers[0]?.url ?? null;
  const displayTitle = tmdb?.name || title.title;
  const originalTitle = tmdb?.original_name || title.original_title;

  if (isMobile) {
    return (
      <>
        {/* Mobile: 460px full-bleed hero with bottom-anchored poster+title */}
        <div className="relative -mx-4 -mt-6 overflow-hidden" style={{ height: 460 }}>
          {backdropUrl ? (
            <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(9,9,11,0.3) 0%, rgba(9,9,11,0.1) 35%, #09090b 95%)",
            }}
          />
          {/* Bottom-anchored poster + title row */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end gap-4 px-4 pb-5">
            <div className="w-[108px] shrink-0">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={title.title}
                  className="w-full rounded-xl shadow-2xl"
                  width={500}
                  height={750}
                  loading="eager"
                />
              ) : (
                <div className="aspect-[2/3] bg-zinc-800 rounded-xl" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-400 font-semibold mb-1">
                SHOW · {title.release_year ?? tmdb?.first_air_date?.slice(0, 4) ?? ""}
                {title.offers[0]?.provider_name ? ` · ${title.offers[0].provider_name}` : ""}
              </div>
              <h1 className="text-[26px] leading-[1.05] font-bold text-white line-clamp-3">{displayTitle}</h1>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="bg-white/[0.08] border border-white/[0.10] text-zinc-300 text-[11px] px-2 py-0.5 rounded-full"
                  >
                    {g}
                  </span>
                ))}
                {title.imdb_score && (
                  <span className="bg-amber-400/[0.15] border border-amber-400/[0.3] text-amber-300 text-[11px] px-2 py-0.5 rounded-full">
                    ★ {title.imdb_score.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Mobile CTA row */}
        <div className="flex gap-2 -mt-2">
          {firstOfferUrl ? (
            <a
              href={firstOfferUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-zinc-950 px-4 py-3 rounded-xl text-[14px] font-bold transition-colors"
            >
              ▶ Play
            </a>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 bg-white/[0.06] border border-white/[0.08] text-zinc-500 px-4 py-3 rounded-xl text-[14px] font-bold cursor-not-allowed">
              ▶ No stream
            </div>
          )}
          <TrackButton titleId={title.id} isTracked={title.is_tracked} titleData={title} />
        </div>
        {title.is_tracked && title.eta_days != null && (
          <div className="text-xs text-zinc-400 text-center">
            Finish in ~{formatEta(title.eta_days)} at your current pace
          </div>
        )}
      </>
    );
  }

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
        <div className="w-48 sm:w-56 lg:w-60 shrink-0 mx-auto sm:mx-0">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={title.title}
              className="w-full rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.7)] border border-white/[0.08]"
              width={500}
              height={750}
              loading="eager"
            />
          ) : (
            <div className="aspect-[2/3] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 border border-white/[0.08]">
              No poster
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 max-w-[820px]">
          <div>
            {tmdb?.tagline && <p className="text-sm text-amber-400 italic mb-1">{tmdb.tagline}</p>}
            <Kicker className="mb-2">
              TV Show{title.release_year ? ` · ${title.release_year}` : ""}
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
            <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">TV</span>
            {tmdb?.first_air_date && <span>{tmdb.first_air_date.slice(0, 4)}</span>}
            {tmdb?.last_air_date &&
              tmdb.first_air_date?.slice(0, 4) !== tmdb.last_air_date.slice(0, 4) && (
                <span>– {tmdb.last_air_date.slice(0, 4)}</span>
              )}
            {tmdb?.episode_run_time?.[0] && (
              <>
                <span className="text-zinc-600">·</span>
                <span>{tmdb.episode_run_time[0]}m/ep</span>
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
            {tmdb && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  {tmdb.number_of_seasons} season{tmdb.number_of_seasons !== 1 ? "s" : ""}
                </span>
                <span className="text-zinc-600">·</span>
                <span>{tmdb.number_of_episodes} episodes</span>
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

          {/* Networks */}
          {tmdb?.networks && tmdb.networks.length > 0 && <NetworkList networks={tmdb.networks} />}

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
            <WatchButtonGroup offers={title.offers} variant="inline" maxVisible={3} />
          </div>
          {title.is_tracked && title.eta_days != null && (
            <div className="text-xs text-zinc-400">
              Finish in ~{formatEta(title.eta_days)} at your current pace
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
