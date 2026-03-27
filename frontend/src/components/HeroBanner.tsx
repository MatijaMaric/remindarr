import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Episode } from "../types";
import { formatEpisodeCode, getUniqueProviders } from "./EpisodeComponents";
import { useDominantColors } from "./useDominantColor";
import WatchButton from "./WatchButton";

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
  if (episode.still_path)
    return `https://image.tmdb.org/t/p/w1280${episode.still_path}`;
  if (episode.poster_url) return episode.poster_url;
  return null;
}

export default function HeroBanner({ episodes }: { episodes: Episode[] }) {
  const slides = getHeroBannerSlides(episodes);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const imageUrls = useMemo(
    () => slides.map((s) => getHeroImageUrl(s.featured)),
    [slides]
  );
  const colors = useDominantColors(imageUrls);

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

  if (slides.length === 0) return null;

  const current = slides[activeIndex];
  const currentPosterUrl = current.featured.poster_url;

  return (
    <div
      className="group hidden lg:block w-[100vw] relative left-[50%] ml-[-50vw] overflow-hidden h-[450px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Dominant color background layers - full viewport width */}
      {slides.map((slide, i) => (
        <div
          key={`bg-${slide.featured.title_id}`}
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: i === activeIndex ? 1 : 0,
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
            style={{ opacity: i === activeIndex ? 1 : 0 }}
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

      {/* Content overlay */}
      <div className="relative z-10 h-full max-w-[1920px] mx-auto flex">
        {/* Continue Watching card (left side) */}
        {current.sidebar.length > 0 && (
          <div className="w-72 shrink-0 flex items-center px-4">
            <div className="w-full bg-zinc-900/80 backdrop-blur-sm rounded-xl p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-400 font-medium mb-3">
                Continue Watching
              </p>
              <div className="space-y-1">
                {current.sidebar.map((item) => {
                  const slideIdx = slides.findIndex(
                    (s) => s.featured.title_id === item.titleId
                  );
                  return (
                    <button
                      key={item.titleId}
                      onClick={() => goTo(slideIdx)}
                      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        slideIdx === activeIndex
                          ? "bg-white/15"
                          : "hover:bg-white/10"
                      }`}
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.showTitle}
                          className="w-8 h-12 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-12 rounded bg-zinc-700 shrink-0" />
                      )}
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold text-white truncate">
                          {item.showTitle}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {item.episodeCode}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Poster + text info */}
        <div className="flex items-center gap-6 px-8">
          {/* Show poster */}
          {currentPosterUrl && (
            <Link
              to={`/title/${current.featured.title_id}`}
              className="shrink-0"
            >
              <img
                src={currentPosterUrl}
                alt={current.featured.show_title}
                className="h-[300px] rounded-lg shadow-2xl object-cover"
                style={{ aspectRatio: "2/3" }}
              />
            </Link>
          )}

          {/* Episode info */}
          <div
            className="flex flex-col justify-center max-w-md"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
          >
            <p className="text-xs uppercase tracking-widest text-amber-400 font-medium mb-2">
              Currently Watching
            </p>
            <Link
              to={`/title/${current.featured.title_id}`}
              className="group"
            >
              <h2 className="text-4xl font-bold text-white group-hover:text-amber-300 transition-colors">
                {current.featured.show_title}
              </h2>
            </Link>
            <p className="text-xl text-zinc-200 mt-2">
              {formatEpisodeCode(current.featured)}
              {current.featured.name && ` · ${current.featured.name}`}
            </p>
            {current.featured.overview && (
              <p className="text-zinc-300 mt-3 line-clamp-3 max-w-xl">
                {current.featured.overview}
              </p>
            )}
            <p className="text-sm text-amber-300 mt-4">
              {current.remainingCount} episode
              {current.remainingCount !== 1 ? "s" : ""} remaining
            </p>
            {(() => {
              const providers = getUniqueProviders(current.featured.offers);
              if (providers.length === 0) return null;
              return (
                <div className="flex gap-2 mt-3">
                  {providers.slice(0, 4).map((o) => (
                    <WatchButton
                      key={o.provider_id}
                      url={o.url}
                      providerId={o.provider_id}
                      providerName={o.provider_name}
                      providerIconUrl={o.provider_icon_url}
                      monetizationType={o.monetization_type}
                      variant="full"
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Navigation dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${
                i === activeIndex
                  ? "bg-amber-400"
                  : "bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
