import { useState } from "react";
import { CheckCircle } from "lucide-react";
import * as api from "../api";
import FullBleedCarousel from "./FullBleedCarousel";
import { posterUrl as buildPosterUrl } from "../lib/tmdb-images";
import { MediaCard } from "./MediaCard";

export interface MovieTrackItem {
  id: string;
  title: string;
  release_date: string | null;
  release_year: number | null;
  poster_url: string | null;
  offers: { url: string; provider_name: string }[];
}

interface MovieRowProps {
  variant: "to_watch" | "upcoming";
  movies: MovieTrackItem[];
}

function formatReleaseDate(date: string | null, year: number | null): string {
  if (date) {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  return year ? String(year) : "";
}

function relativeRelease(date: string | null): string {
  if (!date) return "";
  const today = new Date().setHours(0, 0, 0, 0);
  const release = new Date(date + "T00:00:00").getTime();
  const diffDays = Math.round((release - today) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    if (abs < 7) return `${abs}d ago`;
    if (abs < 30) return `${Math.round(abs / 7)}w ago`;
    return formatReleaseDate(date, null);
  }
  if (diffDays <= 14) return `in ${diffDays} days`;
  if (diffDays <= 60) return `in ${Math.round(diffDays / 7)} wks`;
  return formatReleaseDate(date, null);
}

function releaseMeta(variant: "to_watch" | "upcoming", movie: MovieTrackItem): string {
  if (variant === "to_watch") {
    return movie.release_date
      ? `Released ${relativeRelease(movie.release_date)}`
      : movie.release_year
        ? String(movie.release_year)
        : "";
  }
  return movie.release_date
    ? formatReleaseDate(movie.release_date, null)
    : movie.release_year
      ? String(movie.release_year)
      : "";
}

export default function MovieRow({ variant, movies }: MovieRowProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = movies.filter((m) => !dismissed.has(m.id));

  if (visible.length === 0) return null;

  async function handleWatched(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    try {
      await api.watchMovie(id);
    } catch {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <FullBleedCarousel>
      {visible.map((movie) => (
        <div key={movie.id} className="w-52 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
          <MediaCard
            aspect="poster"
            to={`/title/${movie.id}`}
            imageUrl={buildPosterUrl(movie.poster_url, "w342") ?? null}
            imageAlt={movie.title}
            title={movie.title}
            titleClamp={2}
            meta={releaseMeta(variant, movie)}
            badge={
              variant === "upcoming" && movie.release_date
                ? {
                    label: relativeRelease(movie.release_date),
                    tone: "accent",
                    position: "top-left",
                  }
                : undefined
            }
            footer={
              variant === "to_watch" ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    void handleWatched(movie.id);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCircle size={14} />
                  Mark watched
                </button>
              ) : undefined
            }
          />
        </div>
      ))}
    </FullBleedCarousel>
  );
}
