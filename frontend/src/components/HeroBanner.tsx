import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Episode } from "../types";
import { formatEpisodeCode } from "./EpisodeComponents";
import { useDominantColors } from "./useDominantColor";
import WatchButtonGroup from "./WatchButtonGroup";
import { backdropUrl as mkBackdropUrl } from "../lib/tmdb-images";

export interface HeroBannerSlide {
  featured: Episode;
  remainingCount: number;
  sidebar: {
    showTitle: string;
    episodeCode: string;
    titleId: string;
    posterUrl: string | null;
  }[];
}

export function getHeroBannerSlides(unwatched: Episode[]): HeroBannerSlide[] {
  // Group by show, pick first unwatched per show
  const showMap = new Map<string, Episode[]>();
  for (const ep of unwatched) {
    if (!showMap.has(ep.title_id)) showMap.set(ep.title_id, []);
    showMap.get(ep.title_id)!.push(ep);
  }

  const slides: HeroBannerSlide[] = [];
  for (const [, eps] of showMap) {
    eps.sort((a, b) =>
      a.season_number !== b.season_number
        ? a.season_number - b.season_number
        : a.episode_number - b.episode_number
    );
    const featured = eps[0];
    slides.push({
      featured,
      remainingCount: eps.length,
      sidebar: [],
    });
  }

  // Limit to 6 slides
  const limited = slides.slice(0, 6);

  // Build sidebar for each slide (other shows)
  for (let i = 0; i < limited.length; i++) {
    limited[i].sidebar = limited
      .filter((_, j) => j !== i)
      .map((s) => ({
        showTitle: s.featured.show_title,
        episodeCode: formatEpisodeCode(s.featured),
        titleId: s.featured.title_id,
        posterUrl: s.featured.poster_url ?? null,
      }));
  }

  return limited;
}

export function getHeroImageUrl(episode: Episode): string | null {
  if (episode.backdrop_url) return episode.backdrop_url;
  if (episode.still_path) return mkBackdropUrl(episode.still_path, "w1280");
  if (episode.poster_url) return episode.poster_url;
  return null;
}

export default function HeroBanner({
  episodes,
  onToggleWatched,
}: {
  episodes: Episode[];
  onToggleWatched?: (episodeId: number, currentlyWatched: boolean) => void;
}) {
  const slides = getHeroBannerSlides(episodes);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [markingWatched, setMarkingWatched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const imageUrls = useMemo(
    () => slides.map((s) => getHeroImageUrl(s.featured)),
    [slides]
  );
  const colors = useDominantColors(imageUrls);

  // Clamp to valid range without mutating state (avoids extra re-render)
  const safeIndex = slides.length > 0 ? Math.min(activeIndex, slides.length - 1) : 0;

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex((index + slides.length) % slides.length);
    },
    [slides.length]
  );

  // Auto-advance
  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 8000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length, isPaused]);

  const handleMarkWatched = useCallback(() => {
    const ep = slides[safeIndex]?.featured;
    if (!ep || markingWatched) return;
    setMarkingWatched(true);
    onToggleWatched?.(ep.id, false);
    // Clear the spinner on the next microtask so the button briefly shows "Marking…"
    Promise.resolve().then(() => setMarkingWatched(false));
  }, [slides, safeIndex, markingWatched, onToggleWatched]);

  if (slides.length === 0) return null;

  const current = slides[safeIndex];

  return (
    <div
      className="group hidden lg:block w-[100vw] relative left-[50%] ml-[-50vw] overflow-hidden h-[520px] dark-section"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Dominant color background layers - full viewport width */}
      {slides.map((slide, i) => (
        <div
          key={`bg-${slide.featured.title_id}`}
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: i === safeIndex ? 1 : 0,
            backgroundColor: colors[i]?.color ?? "rgb(24, 24, 27)",
          }}
        />
      ))}

      {/* Backdrop images - positioned mid-to-right */}
      {slides.map((slide, i) => {
        const url = getHeroImageUrl(slide.featured);
        if (!url) return null;
        return (
          <div
            key={`img-${slide.featured.title_id}`}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === safeIndex ? 1 : 0 }}
          >
            <img
              src={url}
              alt=""
              className="absolute right-0 top-0 h-full w-[60%] object-cover"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 25%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 25%)",
              }}
              width={1280}
              height={720}
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        );
      })}

      {/* Dark scrim gradient for text contrast */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)",
        }}
      />

      {/* Content overlay — bottom-left anchored, text aligned to main container */}
      <div className="relative z-10 h-full flex items-end pb-12">
        <div className="max-w-[1440px] mx-auto px-4 w-full">
        <div className="max-w-[560px]">
          {/* Kicker */}
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-400 mb-3">
            Continue watching
            {current.remainingCount > 0 && ` · ${current.remainingCount} unwatched`}
          </p>

          {/* Title */}
          <Link to={`/title/${current.featured.title_id}`} className="group">
            <h2 className="text-5xl sm:text-[56px] font-extrabold tracking-[-0.03em] leading-none text-white group-hover:text-amber-300 transition-colors mb-4">
              {current.featured.show_title}
            </h2>
          </Link>

          {/* Episode info */}
          <p className="text-base text-zinc-300 leading-relaxed mb-6 line-clamp-2">
            {formatEpisodeCode(current.featured)}
            {current.featured.name && ` · ${current.featured.name}`}
            {current.featured.overview && ` — ${current.featured.overview}`}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to={`/title/${current.featured.title_id}`}
              className="bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              ▶ Play S{current.featured.season_number}·E{current.featured.episode_number}
            </Link>
            <button
              onClick={handleMarkWatched}
              disabled={markingWatched}
              className="bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-zinc-100 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {markingWatched ? "Marking…" : "Mark watched"}
            </button>
            <WatchButtonGroup offers={current.featured.offers ?? []} variant="inline" maxVisible={2} />
          </div>
          {/* Metadata strip */}
          {current.featured.offers && current.featured.offers.length > 0 && (
            <p className="mt-3 font-mono text-[11px] text-zinc-500 tracking-wide">
              {current.featured.offers[0].provider_name}
            </p>
          )}

          {/* Slide dots */}
          {slides.length > 1 && (
            <div className="flex gap-2 mt-6">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`h-1 rounded-full transition-all cursor-pointer ${
                    i === safeIndex ? "w-6 bg-amber-400" : "w-2 bg-white/30 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Slide nav arrows — top-right of hero */}
        {slides.length > 1 && (
          <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => goTo(safeIndex - 1)}
              className="bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => goTo(safeIndex + 1)}
              className="bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
