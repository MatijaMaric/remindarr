import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type {
  CrewMember,
  MovieDetailsResponse,
  ReleaseDatesResult,
  WatchHistoryEntry,
  WatchProviderCountry,
} from "../../types";
import Cast from "../../components/title-detail/Cast";
import Crew from "../../components/title-detail/Crew";
import ExternalLinks from "../../components/ExternalLinks";
import MovieHero from "../../components/title-detail/MovieHero";
import ProvidersSection from "../../components/title-detail/ProvidersSection";
import RatingsSection from "../../components/title-detail/RatingsSection";
import ReleaseDates from "../../components/title-detail/ReleaseDates";
import { Section } from "../../components/title-detail/Section";
import { formatCurrency } from "../../components/title-detail/utils";
import SectionErrorBoundary from "../../components/SectionErrorBoundary";
import SuggestionsRow from "../../components/title-detail/SuggestionsRow";

export default function MovieDetail({ data }: { data: MovieDetailsResponse }) {
  const { t } = useTranslation();
  const { title, tmdb, country } = data;
  const [watched, setWatched] = useState(title.is_watched ?? false);
  const [playCount, setPlayCount] = useState(0);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    api
      .getWatchHistory(title.id)
      .then(({ history, playCount: cnt }) => {
        setWatchHistory(history);
        setPlayCount(cnt);
      })
      .catch(() => {});
  }, [title.id]);

  async function toggleWatched() {
    const prev = watched;
    setWatched(!prev);
    try {
      if (prev) {
        await api.unwatchMovie(title.id);
      } else {
        await api.watchMovie(title.id);
        // Refresh history after marking watched
        const { history, playCount: cnt } = await api.getWatchHistory(title.id);
        setWatchHistory(history);
        setPlayCount(cnt);
      }
    } catch {
      setWatched(prev);
    }
  }

  const overview = tmdb?.overview || title.short_description;

  // Release dates for the user's country, with US as fallback
  const countryReleaseDates = tmdb?.release_dates?.results?.find(
    (r: ReleaseDatesResult) => r.iso_3166_1 === country,
  );
  const usReleaseDates = tmdb?.release_dates?.results?.find(
    (r: ReleaseDatesResult) => r.iso_3166_1 === "US",
  );
  const releaseDates = countryReleaseDates || usReleaseDates;

  // Watch providers for the user's country
  const watchProviders = tmdb?.["watch/providers"]?.results?.[country] as WatchProviderCountry | undefined;

  // Key crew
  const directors = tmdb?.credits?.crew?.filter((c: CrewMember) => c.job === "Director") || [];
  const writers =
    tmdb?.credits?.crew?.filter((c: CrewMember) => c.department === "Writing").slice(0, 5) || [];
  const cast = tmdb?.credits?.cast?.slice(0, 20) || [];

  const watchedActions = (
    <>
      <button
        onClick={toggleWatched}
        aria-pressed={watched}
        className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
          watched
            ? "bg-emerald-500 text-white hover:bg-red-500"
            : "bg-zinc-800 text-zinc-400 hover:bg-emerald-500 hover:text-white"
        }`}
      >
        {watched ? t("episodes.markAsUnwatched") : t("episodes.markAsWatched")}
      </button>
      {playCount > 0 && (
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="min-h-8 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors cursor-pointer"
          title="Watch history"
        >
          <span>Watched {playCount}x</span>
          <span className="text-zinc-600">{historyOpen ? "▲" : "▼"}</span>
        </button>
      )}
    </>
  );

  const watchHistoryPanel =
    historyOpen && watchHistory.length > 0 ? (
      <Card tone="translucent" radius="lg" padding="none" className="mt-3 overflow-hidden">
        <div className="px-3 py-2 text-xs font-medium text-zinc-400 border-b border-white/[0.06]">
          Watch History
        </div>
        <ul>
          {watchHistory.map((entry, i) => (
            <li
              key={entry.id}
              className={`px-3 py-2 text-xs text-zinc-300 flex items-center gap-2 ${
                i < watchHistory.length - 1 ? "border-b border-zinc-800/50" : ""
              }`}
            >
              <span className="text-zinc-500 shrink-0">
                {new Date(entry.watchedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {entry.note && <span className="text-zinc-400 italic">{entry.note}</span>}
            </li>
          ))}
        </ul>
      </Card>
    ) : null;

  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <MovieHero title={title} tmdb={tmdb} watchedActions={watchedActions} watchHistoryPanel={watchHistoryPanel} />

      {/* Metadata strip */}
      <div className="dark-section -mx-4 px-6 sm:px-12 py-5 flex flex-wrap gap-x-10 gap-y-3 border-b border-white/[0.06]">
        {[
          { label: "TYPE", value: "Movie" },
          title.runtime_minutes ? { label: "RUNTIME", value: `${title.runtime_minutes} min` } : null,
          tmdb?.status ? { label: "STATUS", value: tmdb.status } : null,
          title.offers[0]?.provider_name ? { label: "NETWORK", value: title.offers[0].provider_name } : null,
          title.imdb_score ? { label: "IMDB", value: `★ ${title.imdb_score.toFixed(1)}` } : null,
        ]
          .filter(Boolean)
          .map((cell) => (
            <div key={cell!.label}>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">
                {cell!.label}
              </div>
              <div className="font-mono text-[13px] font-semibold text-zinc-100">{cell!.value}</div>
            </div>
          ))}
      </div>

      {/* Overview */}
      {overview && (
        <Section title="Overview">
          <p className="text-zinc-300 leading-relaxed select-text">{overview}</p>
        </Section>
      )}

      {/* Rating & Social */}
      <SectionErrorBoundary label="ratings">
        <RatingsSection titleId={title.id} shareTitle={tmdb?.title || title.title} />
      </SectionErrorBoundary>

      {/* Cast & Crew */}
      <SectionErrorBoundary label="crew">
        <Crew directors={directors} writers={writers} />
      </SectionErrorBoundary>
      <SectionErrorBoundary label="cast">
        <Cast cast={cast} />
      </SectionErrorBoundary>

      {/* Release Dates */}
      <SectionErrorBoundary label="release dates">
        <ReleaseDates releaseDates={releaseDates} />
      </SectionErrorBoundary>

      {/* Streaming Availability */}
      <SectionErrorBoundary label="streaming providers">
        <ProvidersSection offers={title.offers} watchProviders={watchProviders} watchLink={watchProviders?.link} />
      </SectionErrorBoundary>

      {/* Suggestions */}
      <SuggestionsRow titleId={title.id} type="movie" />

      {/* External Links */}
      {tmdb && (
        <Section title="Links">
          <ExternalLinks
            externalIds={tmdb.external_ids ?? { imdb_id: tmdb.imdb_id }}
            tmdbId={tmdb.id}
            type="movie"
          />
        </Section>
      )}

      {/* Additional Info */}
      {tmdb && (
        <Section title="Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {tmdb.original_language && (
              <div>
                <span className="text-zinc-500 block">Original Language</span>
                <span className="text-zinc-300">{tmdb.original_language.toUpperCase()}</span>
              </div>
            )}
            {tmdb.production_countries?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Country</span>
                <span className="text-zinc-300">
                  {tmdb.production_countries.map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.spoken_languages?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Languages</span>
                <span className="text-zinc-300">
                  {tmdb.spoken_languages.map((l) => l.english_name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.budget > 0 && (
              <div>
                <span className="text-zinc-500 block">Budget</span>
                <span className="text-zinc-300">{formatCurrency(tmdb.budget)}</span>
              </div>
            )}
            {tmdb.revenue > 0 && (
              <div>
                <span className="text-zinc-500 block">Revenue</span>
                <span className="text-zinc-300">{formatCurrency(tmdb.revenue)}</span>
              </div>
            )}
            {tmdb.production_companies?.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-zinc-500 block">Production</span>
                <span className="text-zinc-300">
                  {tmdb.production_companies.map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
