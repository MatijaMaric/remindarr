import { memo, useState } from "react";
import { Link } from "react-router";
import type { Title } from "../types";
import TrackButton from "./TrackButton";
import WatchButtonGroup from "./WatchButtonGroup";
import VisibilityButton from "./VisibilityButton";
import StatusPicker from "./StatusPicker";

interface Props {
  title: Title;
  onTrackToggle?: () => void;
  showVisibilityToggle?: boolean;
  onVisibilityToggle?: (titleId: string, isPublic: boolean) => void;
  hideTypeBadge?: boolean;
  showProgressBar?: boolean;
  showStatusPicker?: boolean;
}

const TitleCard = memo(function TitleCard({ title, onTrackToggle, showVisibilityToggle, onVisibilityToggle, hideTypeBadge, showProgressBar, showStatusPicker }: Props) {
  const [userStatus, setUserStatus] = useState(title.user_status ?? null);

  return (
    <div className={`bg-zinc-900 rounded-xl overflow-hidden hover:scale-[1.02] transition-transform duration-200 flex flex-col${title.show_status === "completed" ? " opacity-75" : ""}`}>
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
        {!hideTypeBadge && title.object_type === "SHOW" && (
          <span className="absolute top-2 left-2 bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
            TV
          </span>
        )}
        {(title.show_status === "completed" || userStatus === "completed") && (
          <>
            <div className="absolute inset-0 bg-emerald-900/40 pointer-events-none" data-testid="completed-overlay" />
            <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              Completed
            </span>
          </>
        )}
        {title.show_status === "caught_up" && userStatus !== "completed" && (
          <span className="absolute bottom-2 left-2 bg-teal-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            Caught Up
          </span>
        )}
        {userStatus === "on_hold" && (
          <span className="absolute bottom-2 left-2 bg-yellow-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            On Hold
          </span>
        )}
        {userStatus === "dropped" && (
          <span className="absolute bottom-2 left-2 bg-red-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            Dropped
          </span>
        )}
        {userStatus === "plan_to_watch" && (
          <span className="absolute bottom-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            Plan to Watch
          </span>
        )}
        {title.show_status === "watching" && title.object_type === "SHOW" && (
          <>
            {showProgressBar && (title.released_episodes_count ?? title.total_episodes ?? 0) > 0 ? (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${((title.watched_episodes_count ?? 0) / (title.released_episodes_count ?? title.total_episodes ?? 1)) * 100}%` }}
                />
              </div>
            ) : (
              <span className="absolute bottom-2 left-2 bg-zinc-800/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                {title.watched_episodes_count ?? 0}/{title.released_episodes_count ?? title.total_episodes ?? 0} ep
              </span>
            )}
          </>
        )}
        {!title.show_status && title.is_watched && (
          <span className="absolute bottom-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Watched
          </span>
        )}
        {!title.show_status && !title.is_watched && !showProgressBar && title.object_type === "SHOW" && title.total_episodes != null && title.total_episodes > 0 && (
          <span className="absolute bottom-2 left-2 bg-zinc-800/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {title.watched_episodes_count ?? 0}/{title.released_episodes_count ?? title.total_episodes} ep
          </span>
        )}
        {!title.show_status && !title.is_watched && showProgressBar && title.object_type === "SHOW" && title.total_episodes != null && title.total_episodes > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${((title.watched_episodes_count ?? 0) / (title.released_episodes_count ?? title.total_episodes)) * 100}%` }}
            />
          </div>
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
          <WatchButtonGroup offers={title.offers} variant="dropdown" />
          <TrackButton
            titleId={title.id}
            isTracked={title.is_tracked}
            onToggle={onTrackToggle}
            titleData={title}
          />
          {title.is_tracked && (showProgressBar || showStatusPicker) && (
            <StatusPicker
              titleId={title.id}
              objectType={title.object_type}
              currentStatus={userStatus as "plan_to_watch" | "watching" | "on_hold" | "dropped" | "completed" | null}
              onStatusChange={(s) => setUserStatus(s)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default TitleCard;

