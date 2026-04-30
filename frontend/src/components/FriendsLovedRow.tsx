import { Link } from "react-router";
import type { FriendsLovedItem } from "../types";
import FullBleedCarousel from "./FullBleedCarousel";
import { Kicker } from "./design";
import { posterUrl } from "../lib/tmdb-images";

interface FriendsLovedRowProps {
  items: FriendsLovedItem[];
}

export default function FriendsLovedRow({ items }: FriendsLovedRowProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <Kicker>From friends</Kicker>
          <h2 className="text-xl font-bold tracking-[-0.01em]">Friends Loved This Week</h2>
        </div>
      </div>
      <FullBleedCarousel>
        {items.map((item) => {
          const src = posterUrl(item.poster_url, "w185");
          return (
            <Link
              key={item.id}
              to={`/title/${item.id}`}
              className="w-32 flex-shrink-0 group"
              style={{ scrollSnapAlign: "start" }}
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
                {src ? (
                  <img
                    src={src}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                    width={185}
                    height={278}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                    N/A
                  </div>
                )}
              </div>
              <p className="text-sm text-white mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
                {item.title}
              </p>
            </Link>
          );
        })}
      </FullBleedCarousel>
    </section>
  );
}
