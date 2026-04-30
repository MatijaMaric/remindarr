import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { useApiCall } from "../hooks/useApiCall";
import { useAuth } from "../context/AuthContext";
import TitleCard from "../components/TitleCard";
import type { OverlapTitle, Provider } from "../types";
import MultiSelectDropdown from "../components/MultiSelectDropdown";

type FilterMode = "all" | "movies" | "watchable";

function ProviderIcon({ provider }: { provider: Provider }) {
  return (
    <div
      className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
      title={provider.name}
    >
      {provider.icon_url ? (
        <img
          src={provider.icon_url}
          alt={provider.name}
          className="w-5 h-5 rounded"
          loading="lazy"
        />
      ) : null}
      <span>{provider.name}</span>
    </div>
  );
}

export default function UserOverlapPage() {
  const { username, friendUsername } = useParams<{ username: string; friendUsername: string }>();
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const { data, loading, error } = useApiCall(
    (signal) => api.getOverlap(friendUsername!, signal),
    [friendUsername],
  );

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const allGenres = useMemo(() => {
    if (!data) return [];
    const genreSet = new Set<string>();
    for (const title of data.titles) {
      for (const g of title.genres) {
        genreSet.add(g);
      }
    }
    return Array.from(genreSet).sort();
  }, [data]);

  const sharedProviderIds = useMemo(() => {
    if (!data) return new Set<number>();
    return new Set(data.sharedProviders.map((p) => p.id));
  }, [data]);

  const filteredTitles = useMemo((): OverlapTitle[] => {
    if (!data) return [];
    let titles = data.titles;
    if (filterMode === "movies") {
      titles = titles.filter((t) => t.object_type === "MOVIE");
    } else if (filterMode === "watchable") {
      titles = titles.filter((t) =>
        t.offers.some((o) => o.monetization_type === "flatrate" && sharedProviderIds.has(o.provider_id))
      );
    }
    if (selectedGenres.length > 0) {
      titles = titles.filter((t) => selectedGenres.some((g) => t.genres.includes(g)));
    }
    return titles;
  }, [data, filterMode, selectedGenres, sharedProviderIds]);

  // 403 private watchlist state
  if (error) {
    const isPrivate =
      error.includes("private") || error.includes("mutual followers");
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <p className="text-zinc-400 text-lg">
          {isPrivate
            ? t("overlap.privateWatchlist", "This user's watchlist is private.")
            : t("overlap.error", "Something went wrong loading the overlap.")}
        </p>
        <Link
          to={`/user/${friendUsername}`}
          className="inline-block text-amber-400 hover:text-amber-300 text-sm transition-colors"
        >
          {t("overlap.backToProfile", "Back to profile")}
        </Link>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto py-8 space-y-6">
        <div className="h-20 bg-zinc-900 animate-pulse rounded-xl" />
        <div className="h-10 bg-zinc-900 animate-pulse rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-zinc-900 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { counts, sharedProviders, friendUser } = data;
  const viewerName = currentUser?.display_name ?? currentUser?.username ?? username ?? "You";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center gap-4 py-4">
        {/* Viewer avatar */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-black"
            style={{ background: "oklch(0.6 0.1 250)" }}
          >
            {viewerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-zinc-300 font-medium">@{currentUser?.username ?? username}</span>
        </div>

        {/* VS divider */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 text-black font-extrabold text-sm shrink-0">
          vs
        </div>

        {/* Friend avatar */}
        <div className="flex flex-col items-center gap-1">
          {friendUser.image ? (
            <img
              src={friendUser.image}
              alt={friendUser.displayName ?? friendUser.username}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-black"
              style={{ background: "oklch(0.6 0.12 40)" }}
            >
              {(friendUser.displayName ?? friendUser.username).charAt(0).toUpperCase()}
            </div>
          )}
          <Link
            to={`/user/${friendUser.username}`}
            className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
          >
            @{friendUser.username}
          </Link>
        </div>

        {/* Heading */}
        <div className="sm:ml-4 text-center sm:text-left">
          <h1 className="text-xl font-bold text-white">
            {t("overlap.heading", "What to watch together")}
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {t("overlap.withFriend", "with @{{friend}}", { friend: friendUser.username })}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="bg-zinc-800 px-3 py-1.5 rounded-lg text-white font-semibold">
          {counts.intersection}{" "}
          <span className="text-zinc-400 font-normal">
            {t("overlap.inCommon", "in common")}
          </span>
        </span>
        <span className="bg-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400">
          {counts.viewerOnly}{" "}
          {t("overlap.yourOnly", "yours only")}
        </span>
        <span className="bg-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400">
          {counts.friendOnly}{" "}
          {t("overlap.friendOnly", "{{friend}}'s only", { friend: friendUser.username })}
        </span>
        {sharedProviders.length > 0 && (
          <span className="bg-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400">
            {sharedProviders.length}{" "}
            {t("overlap.sharedProviders", "shared streaming services")}
          </span>
        )}
      </div>

      {/* Shared providers row */}
      {sharedProviders.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 font-semibold">
            {t("overlap.bothSubscribedTo", "Both subscribed to")}
          </p>
          <div className="flex flex-wrap gap-2">
            {sharedProviders.map((p) => (
              <ProviderIcon key={p.id} provider={p} />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["all", "movies", "watchable"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterMode === mode
                ? "bg-amber-500 text-black"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {mode === "all" && t("overlap.filterAll", "All")}
            {mode === "movies" && t("overlap.filterMovies", "Movies only")}
            {mode === "watchable" && t("overlap.filterWatchable", "Watchable now")}
          </button>
        ))}
        {allGenres.length > 0 && (
          <MultiSelectDropdown
            options={allGenres.map((g) => ({ value: g, label: g }))}
            selected={selectedGenres}
            onChange={setSelectedGenres}
            label={t("overlap.filterByGenre", "By genre")}
          />
        )}
      </div>

      {/* Results */}
      {filteredTitles.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-zinc-400 text-lg">
            {counts.intersection === 0
              ? t(
                  "overlap.noCommon",
                  "You and @{{friend}} don't have any titles in common yet. Try recommending something!",
                  { friend: friendUser.username }
                )
              : t("overlap.noMatchingFilter", "No titles match the current filter.")}
          </p>
          {counts.intersection === 0 && (
            <Link
              to={`/user/${friendUser.username}`}
              className="inline-block text-amber-400 hover:text-amber-300 text-sm transition-colors"
            >
              {t("overlap.viewProfile", "View @{{friend}}'s profile", { friend: friendUser.username })}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredTitles.map((title) => (
            <TitleCard
              key={title.id}
              title={title}
              showProviderBadge
            />
          ))}
        </div>
      )}
    </div>
  );
}
