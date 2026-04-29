import { useParams, Link } from "react-router";
import { getSharedWatchlist } from "../api";
import type { Title } from "../api";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

export default function SharedWatchlistPage() {
  const { token } = useParams<{ token: string }>();

  const { data, loading, error } = useApiCall(
    (signal) => getSharedWatchlist(token!, signal),
    [token],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
        <TitleGridSkeleton count={12} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-bold text-zinc-100">This link is invalid or has been revoked</h1>
        <p className="text-sm text-zinc-500">The watchlist you are looking for is no longer available.</p>
        <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm transition-colors">
          Go to Remindarr
        </Link>
      </div>
    );
  }

  const { username, titles } = data as { username: string; titles: Title[] };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-zinc-100">
          {titles.length} title{titles.length !== 1 ? "s" : ""} shared by{" "}
          <span className="text-amber-400">@{username}</span>
        </h1>
        <p className="text-sm text-zinc-500">Read-only view — sign in to track these titles</p>
      </div>

      {titles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-2">
          <p className="text-zinc-400 text-sm">This watchlist is empty</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {titles.map((title) => (
            <Link
              key={title.id}
              to={`/title/${title.id}`}
              className="group bg-zinc-900 rounded-xl overflow-hidden flex flex-col hover:ring-2 hover:ring-amber-400/40 transition-all"
            >
              <div className="aspect-[2/3] w-full bg-zinc-800 overflow-hidden">
                {title.poster_url ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${title.poster_url}`}
                    alt={title.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-medium px-2 text-center">
                    {title.title}
                  </div>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <div className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-tight">
                  {title.title}
                </div>
                {title.release_year && (
                  <div className="text-[10px] text-zinc-500">{title.release_year}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <footer className="text-center text-xs text-zinc-600 pt-8 pb-4">
        Powered by{" "}
        <a href="/" className="text-amber-400 hover:text-amber-300 transition-colors">
          Remindarr
        </a>
      </footer>
    </div>
  );
}
