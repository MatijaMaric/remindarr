import { useState, useEffect, useCallback } from "react";
import * as api from "../api";
import type { Title, Provider } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";

interface Props {
  type: string[];
  onTypeChange: (type: string[]) => void;
  daysBack: number;
  onDaysBackChange: (days: number) => void;
  genre: string[];
  onGenreChange: (genre: string[]) => void;
  provider: string[];
  onProviderChange: (provider: string[]) => void;
  language: string[];
  onLanguageChange: (language: string[]) => void;
  onClearFilters?: () => void;
  hideTracked?: boolean;
  onHideTrackedChange?: (value: boolean) => void;
}

export default function NewReleases({
  type,
  onTypeChange,
  daysBack,
  onDaysBackChange,
  genre,
  onGenreChange,
  provider,
  onProviderChange,
  language,
  onLanguageChange,
  onClearFilters,
  hideTracked,
  onHideTrackedChange,
}: Props) {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const [genres, setGenres] = useState<string[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([api.getGenres(), api.getProviders(), api.getLanguages()]).then(
      ([g, p, l]) => {
        setGenres(g.genres);
        setProviders(p.providers);
        setLanguages(l.languages);
      }
    );
  }, []);

  const fetchTitles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getTitles({
        daysBack,
        type: type.length ? type.join(",") : undefined,
        genre: genre.length ? genre.join(",") : undefined,
        provider: provider.length ? provider.join(",") : undefined,
        language: language.length ? language.join(",") : undefined,
        excludeTracked: hideTracked || undefined,
      });
      setTitles(res.titles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [daysBack, type, genre, provider, language, hideTracked]);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await api.syncReleases(daysBack, type.length === 1 ? type[0] : undefined);
      await fetchTitles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar
          type={type}
          onTypeChange={onTypeChange}
          daysBack={daysBack}
          onDaysBackChange={onDaysBackChange}
          genre={genre}
          onGenreChange={onGenreChange}
          genres={genres}
          provider={provider}
          onProviderChange={onProviderChange}
          providers={providers}
          language={language}
          onLanguageChange={onLanguageChange}
          languages={languages}
          onClearFilters={onClearFilters}
          hideTracked={hideTracked}
          onHideTrackedChange={onHideTrackedChange}
        />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {syncing ? "Syncing..." : "Sync New Releases"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={fetchTitles}
          emptyMessage="No releases found. Click 'Sync New Releases' to fetch data from TMDB."
        />
      )}
    </div>
  );
}
