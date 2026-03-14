import { useState, useEffect, useCallback } from "react";
import * as api from "../api";
import type { Title, Provider } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";

export default function NewReleases() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [type, setType] = useState("");
  const [daysBack, setDaysBack] = useState(30);
  const [genre, setGenre] = useState("");
  const [provider, setProvider] = useState("");
  const [language, setLanguage] = useState("");
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
        type: type || undefined,
        genre: genre || undefined,
        provider: provider || undefined,
        language: language || undefined,
      });
      setTitles(res.titles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [daysBack, type, genre, provider, language]);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await api.syncReleases(daysBack, type || undefined);
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
          onTypeChange={setType}
          daysBack={daysBack}
          onDaysBackChange={setDaysBack}
          genre={genre}
          onGenreChange={setGenre}
          genres={genres}
          provider={provider}
          onProviderChange={setProvider}
          providers={providers}
          language={language}
          onLanguageChange={setLanguage}
          languages={languages}
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
