import { useState } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import * as api from "../api";
import ScrollableRow from "./ScrollableRow";
import { posterUrl as buildPosterUrl } from "../lib/tmdb-images";

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
    <ScrollableRow className="gap-3 px-4 pb-2">
      {visible.map((movie) => (
        <div key={movie.id} style={{ width: 104, flexShrink: 0 }}>
          <Link to={`/title/${movie.id}`} className="block relative">
            <div
              className="w-[104px] h-[156px] rounded-lg overflow-hidden bg-zinc-800"
            >
              {movie.poster_url && (
                <img
                  src={buildPosterUrl(movie.poster_url, "w185") ?? undefined}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            {variant === "upcoming" && movie.release_date && (
              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-zinc-950 leading-none">
                {relativeRelease(movie.release_date)}
              </span>
            )}
            {variant === "to_watch" && (
              <button
                aria-label="Mark watched"
                onClick={(e) => {
                  e.preventDefault();
                  void handleWatched(movie.id);
                }}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 border border-amber-400/70 text-amber-400 flex items-center justify-center hover:bg-amber-400 hover:text-zinc-950 transition-colors cursor-pointer"
              >
                <Check size={14} />
              </button>
            )}
          </Link>
          <p className="mt-1.5 text-xs text-zinc-200 line-clamp-2 leading-snug">{movie.title}</p>
          <p className="text-[11px] text-zinc-500 leading-none mt-0.5">
            {variant === "to_watch"
              ? (movie.release_date ? `Released ${relativeRelease(movie.release_date)}` : (movie.release_year ? String(movie.release_year) : ""))
              : (movie.release_date ? formatReleaseDate(movie.release_date, null) : (movie.release_year ? String(movie.release_year) : ""))}
          </p>
        </div>
      ))}
    </ScrollableRow>
  );
}
