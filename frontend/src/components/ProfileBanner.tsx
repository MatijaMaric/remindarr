import { Link } from "react-router";
import type { ProfileBackdrop } from "../types";

interface Props {
  backdrops: ProfileBackdrop[];
}

export default function ProfileBanner({ backdrops }: Props) {
  if (backdrops.length === 0) return null;

  return (
    <div className="w-[100vw] relative left-[50%] ml-[-50vw] overflow-hidden h-48 sm:h-56">
      {/* Image grid */}
      <div className="absolute inset-0 flex">
        {backdrops.length === 1 && (
          <Link to={`/title/${backdrops[0].id}`} className="relative w-full h-full">
            <img
              src={backdrops[0].backdrop_url}
              alt={backdrops[0].title}
              className="w-full h-full object-cover"
            />
          </Link>
        )}
        {backdrops.length === 2 && backdrops.map((b) => (
          <Link key={b.id} to={`/title/${b.id}`} className="relative w-1/2 h-full">
            <img
              src={b.backdrop_url}
              alt={b.title}
              className="w-full h-full object-cover"
            />
          </Link>
        ))}
        {backdrops.length >= 3 && (
          <>
            <Link to={`/title/${backdrops[0].id}`} className="relative w-1/2 h-full">
              <img
                src={backdrops[0].backdrop_url}
                alt={backdrops[0].title}
                className="w-full h-full object-cover"
              />
            </Link>
            <div className="w-1/2 h-full flex flex-col">
              {backdrops.slice(1, 3).map((b) => (
                <Link key={b.id} to={`/title/${b.id}`} className="relative w-full h-1/2">
                  <img
                    src={b.backdrop_url}
                    alt={b.title}
                    className="w-full h-full object-cover"
                  />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      {/* Bottom gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent pointer-events-none" />
      {/* Subtle overlay for contrast */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  );
}
