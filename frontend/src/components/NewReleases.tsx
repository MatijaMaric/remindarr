import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title, Provider } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";
import { loadFilters } from "./loadFilters";
import { useAsyncError } from "../hooks/useAsyncError";

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
  hideFilterBar?: boolean;
  showProviderBadge?: boolean;
  showRating?: boolean;
  onResultsCount?: (count: number) => void;
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
  hideFilterBar,
  showProviderBadge,
  showRating,
  onResultsCount,
}: Props) {
  const { t } = useTranslation();
  const [titles, setTitles] = useState<Title[]>([]);
  const { run, error, pending: loading } = useAsyncError();

  const [genres, setGenres] = useState<string[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [regionProviderIds, setRegionProviderIds] = useState<number[]>([]);
  const [priorityLanguageCodes, setPriorityLanguageCodes] = useState<string[]>([]);

  useEffect(() => {
    loadFilters().then(({ genres, providers, languages, regionProviderIds, priorityLanguageCodes }) => {
      setGenres(genres);
      setProviders(providers);
      setLanguages(languages);
      setRegionProviderIds(regionProviderIds);
      setPriorityLanguageCodes(priorityLanguageCodes);
    });
  }, []);

  const fetchTitles = useCallback(() => run(async () => {
    const res = await api.getTitles({
      daysBack,
      type: type.length ? type.join(",") : undefined,
      genre: genre.length ? genre.join(",") : undefined,
      provider: provider.length ? provider.join(",") : undefined,
      language: language.length ? language.join(",") : undefined,
      excludeTracked: hideTracked || undefined,
    });
    setTitles(res.titles);
    onResultsCount?.(res.titles.length);
  }), [run, daysBack, type, genre, provider, language, hideTracked, onResultsCount]);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  return (
    <div className="space-y-4">
      {!hideFilterBar && (
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
          regionProviderIds={regionProviderIds}
          language={language}
          onLanguageChange={onLanguageChange}
          languages={languages}
          priorityLanguageCodes={priorityLanguageCodes}
          onClearFilters={onClearFilters}
          hideTracked={hideTracked}
          onHideTrackedChange={onHideTrackedChange}
        />
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-zinc-500">{t("releases.loading")}</div>
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={fetchTitles}
          emptyMessage={t("releases.empty")}
          showProviderBadge={showProviderBadge}
          showRating={showRating}
        />
      )}
    </div>
  );
}
