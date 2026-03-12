import { Link } from "react-router";
import type { Title } from "../types";
import TrackButton from "./TrackButton";

interface Props {
  title: Title;
  onTrackToggle?: () => void;
}

export default function TitleCard({ title, onTrackToggle }: Props) {
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
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors flex flex-col">
      {/* Poster — clickable link to detail page */}
      <Link to={`/title/${title.id}`} className="aspect-[2/3] bg-gray-800 relative block">
        {title.poster_url ? (
          <img
            src={title.poster_url}
            alt={title.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
            No poster
          </div>
        )}
        {title.object_type === "SHOW" && (
          <span className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            TV
          </span>
        )}
        {title.imdb_score && (
          <span className="absolute top-2 right-2 bg-yellow-500 text-black text-[11px] font-bold px-1.5 py-0.5 rounded">
            {title.imdb_score.toFixed(1)}
          </span>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <Link to={`/title/${title.id}`} className="hover:text-indigo-400 transition-colors">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{title.title}</h3>
          </Link>
          {title.original_title && title.original_title !== title.title && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1 italic">{title.original_title}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">
            {title.release_year}
            {title.runtime_minutes ? ` \u00B7 ${title.runtime_minutes}m` : ""}
          </p>
        </div>

        {/* Streaming providers */}
        {streamingOffers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {streamingOffers.map((offer) => (
              <a
                key={offer.provider_id}
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                title={offer.provider_name}
              >
                <img
                  src={offer.provider_icon_url}
                  alt={offer.provider_name}
                  className="w-7 h-7 rounded-md"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        <div className="mt-auto pt-1">
          <TrackButton
            titleId={title.id}
            isTracked={title.is_tracked}
            onToggle={onTrackToggle ? () => onTrackToggle() : undefined}
            titleData={title}
          />
        </div>
      </div>
    </div>
  );
}
