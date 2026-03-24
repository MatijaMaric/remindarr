import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Episode } from "../types";
import { formatEpisodeCode } from "./EpisodeComponents";

export interface HeroBannerSlide {
  featured: Episode;
  remainingCount: number;
  sidebar: { showTitle: string; episodeCode: string; titleId: string }[];
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
      }));
  }

  return limited;
}

export function getHeroImageUrl(episode: Episode): string | null {
  if (episode.backdrop_url) return episode.backdrop_url;
  if (episode.still_path) return `https://image.tmdb.org/t/p/w1280${episode.still_path}`;
  if (episode.poster_url) return episode.poster_url;
  return null;
}

export default function HeroBanner({ episodes }: { episodes: Episode[] }) {
  const slides = getHeroBannerSlides(episodes);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  return (
    <div
      className="hidden lg:block relative h-[450px] overflow-hidden rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background image with gradient overlay */}
      {slides.map((slide, i) => {
        const url = getHeroImageUrl(slide.featured);
        return (
          <div
            key={slide.featured.title_id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: i === activeIndex ? 1 : 0,
              backgroundImage: url
                ? `linear-gradient(to right, rgba(3,7,18,0.95) 0%, rgba(3,7,18,0.7) 50%, rgba(3,7,18,0.4) 100%), url(${url})`
                : "linear-gradient(to right, rgba(3,7,18,0.95) 0%, rgba(3,7,18,0.7) 50%, rgba(3,7,18,0.4) 100%)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        );
      })}

      {/* Content overlay */}
      <div className="relative z-10 flex h-full">
        {/* Left: episode info */}
        <div className="flex-1 flex flex-col justify-center px-10 max-w-[65%]">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-medium mb-2">
            Currently Watching
          </p>
          <Link to={`/title/${current.featured.title_id}`} className="group">
            <h2 className="text-4xl font-bold text-white group-hover:text-indigo-300 transition-colors">
              {current.featured.show_title}
            </h2>
          </Link>
          <p className="text-xl text-gray-200 mt-2">
            {formatEpisodeCode(current.featured)}
            {current.featured.name && ` · ${current.featured.name}`}
          </p>
          {current.featured.overview && (
            <p className="text-gray-300 mt-3 line-clamp-3 max-w-xl">
              {current.featured.overview}
            </p>
          )}
          <p className="text-sm text-indigo-300 mt-4">
            {current.remainingCount} episode{current.remainingCount !== 1 ? "s" : ""} remaining
          </p>
        </div>

        {/* Right: sidebar */}
        {current.sidebar.length > 0 && (
          <div className="w-[35%] flex flex-col justify-center pr-10 pl-4">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-3">
              Continue Watching
            </p>
            <div className="space-y-2">
              {current.sidebar.map((item) => {
                const slideIdx = slides.findIndex(
                  (s) => s.featured.title_id === item.titleId
                );
                return (
                  <button
                    key={item.titleId}
                    onClick={() => goTo(slideIdx)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      slideIdx === activeIndex
                        ? "bg-white/10"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <p className="font-semibold text-white text-sm truncate">
                      {item.showTitle}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {item.episodeCode}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Navigation arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
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
                i === activeIndex ? "bg-indigo-400" : "bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
