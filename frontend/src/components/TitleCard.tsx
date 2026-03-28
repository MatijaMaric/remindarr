import { memo } from "react";
import { Link } from "react-router";
import type { Title } from "../types";
import TrackButton from "./TrackButton";
import WatchButton from "./WatchButton";
import VisibilityButton from "./VisibilityButton";

interface Props {
  title: Title;
  onTrackToggle?: () => void;
  showVisibilityToggle?: boolean;
  onVisibilityToggle?: (titleId: string, isPublic: boolean) => void;
}

const TitleCard = memo(function TitleCard({ title, onTrackToggle, showVisibilityToggle, onVisibilityToggle }: Props) {
  // Deduplicate offers by provider (keep best quality)
  const uniqueProviders = new Map<number, Title["offers"][0]>();
  for (const offer of title.offers) {
    if (offer.monetization_type === "FLATRATE" || offer.monetization_type === "FREE" || offer.monetization_type === "ADS") {
      if (!uniqueProviders.has(offer.provider_id)) {
        uniqueProviders.set(offer.provider_id, offer);
      }
    }
  }
  const streamingOffers = Array.from(uniqueProviders.values());

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden hover:scale-[1.02] transition-transform duration-200 flex flex-col">
      {/* Poster — clickable link to detail page */}
      <div className="aspect-[2/3] bg-zinc-800 relative">
        <Link to={`/title/${title.id}`} className="block w-full h-full">
          {title.poster_url ? (
            <img
              src={title.poster_url}
              alt={title.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
              No poster
            </div>
          )}
        </Link>
        {title.object_type === "SHOW" && (
          <span className="absolute top-2 left-2 bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
            TV
          </span>
        )}
        {title.is_watched && (
          <span className="absolute bottom-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Watched
          </span>
        )}
        {!title.is_watched && title.object_type === "SHOW" && title.total_episodes != null && title.total_episodes > 0 && (
          <span className="absolute bottom-2 left-2 bg-zinc-800/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {title.watched_episodes_count ?? 0}/{title.total_episodes} ep
          </span>
        )}
        {title.imdb_score && !showVisibilityToggle && (
          <span className="absolute top-2 right-2 bg-yellow-500 text-black text-[11px] font-bold px-1.5 py-0.5 rounded">
            {title.imdb_score.toFixed(1)}
          </span>
        )}
        {showVisibilityToggle && (
          <VisibilityButton
            titleId={title.id}
            isPublic={title.is_public ?? true}
            isTracked={title.is_tracked}
            onToggle={(isPublic) => onVisibilityToggle?.(title.id, isPublic)}
            variant="overlay"
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <Link to={`/title/${title.id}`} className="hover:text-amber-400 transition-colors">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{title.title}</h3>
          </Link>
          {title.original_title && title.original_title !== title.title && (
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1 italic">{title.original_title}</p>
          )}
          <p className="text-xs text-zinc-500 mt-0.5">
            {title.release_year}
            {title.runtime_minutes ? ` \u00B7 ${title.runtime_minutes}m` : ""}
          </p>
        </div>

        {/* Buttons — always anchored at bottom */}
        <div className="mt-auto flex flex-col gap-2">
          {streamingOffers.length > 0 && (
            <WatchButton
              url={streamingOffers[0].url}
              providerId={streamingOffers[0].provider_id}
              providerName={streamingOffers[0].provider_name}
              providerIconUrl={streamingOffers[0].provider_icon_url}
              monetizationType={streamingOffers[0].monetization_type}
              variant="full"
            />
          )}
          <TrackButton
            titleId={title.id}
            isTracked={title.is_tracked}
            onToggle={onTrackToggle}
            titleData={title}
          />
        </div>
      </div>
    </div>
  );
});

export default TitleCard;

