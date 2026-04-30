import { useState } from "react";
import type { TmdbVideo } from "../../types";

export type TrailerEmbedProps = {
  videos: TmdbVideo[];
};

function pickBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
  const trailers = videos.filter((v) => v.site === "YouTube" && v.type === "Trailer");
  if (trailers.length === 0) return null;

  // Sort: official first, then highest size, then most recent published_at
  const sorted = [...trailers].sort((a, b) => {
    if (a.official !== b.official) return a.official ? -1 : 1;
    if (b.size !== a.size) return b.size - a.size;
    return b.published_at.localeCompare(a.published_at);
  });

  return sorted[0] ?? null;
}

export default function TrailerEmbed({ videos }: TrailerEmbedProps) {
  const [playing, setPlaying] = useState(false);
  const trailer = pickBestTrailer(videos);

  if (!trailer) return null;

  const { key } = trailer;
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const autoplay = prefersReducedMotion ? 0 : 1;

  if (playing) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=${autoplay}`}
          title="Trailer"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${key}/hqdefault.jpg`;

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden cursor-pointer group" onClick={() => setPlaying(true)}>
      <img
        src={thumbnailUrl}
        alt="Trailer thumbnail"
        className="w-full h-full object-cover"
        width={480}
        height={360}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors" />
      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="w-16 h-16 text-white drop-shadow-lg group-hover:scale-110 transition-transform"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Play trailer"
        >
          <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
          <polygon points="26,20 26,44 46,32" fill="white" />
        </svg>
      </div>
    </div>
  );
}
