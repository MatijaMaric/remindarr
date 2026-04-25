import { useState } from "react";
import { TMDB_IMG } from "./utils";

const NETWORK_DISPLAY_LIMIT = 5;

export function NetworkList({
  networks,
}: {
  networks: { id: number; name: string; logo_path: string | null }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = networks.length > NETWORK_DISPLAY_LIMIT;
  const visible = expanded ? networks : networks.slice(0, NETWORK_DISPLAY_LIMIT);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {visible.map((n) => (
        <div key={n.id} className="flex items-center gap-1.5">
          {n.logo_path && (
            <img
              src={`${TMDB_IMG}/w92${n.logo_path}`}
              alt={n.name}
              className="h-5 object-contain brightness-0 invert opacity-70"
            />
          )}
          <span className="text-sm text-zinc-400">{n.name}</span>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          {expanded ? "Show less" : `+${networks.length - NETWORK_DISPLAY_LIMIT} more`}
        </button>
      )}
    </div>
  );
}
