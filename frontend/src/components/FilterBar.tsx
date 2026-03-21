import { memo } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown";

interface ProviderOption {
  id: number;
  name: string;
}

interface LanguageOption {
  code: string;
  name: string;
}

interface Props {
  type: string[];
  onTypeChange: (type: string[]) => void;
  daysBack?: number;
  onDaysBackChange?: (days: number) => void;
  showDaysFilter?: boolean;
  genre?: string[];
  onGenreChange?: (genre: string[]) => void;
  genres?: string[];
  provider?: string[];
  onProviderChange?: (provider: string[]) => void;
  providers?: ProviderOption[];
  language?: string[];
  onLanguageChange?: (language: string[]) => void;
  languages?: string[] | LanguageOption[];
  onClearFilters?: () => void;
  hideTracked?: boolean;
  onHideTrackedChange?: (value: boolean) => void;
}

const TYPES = [
  { value: "MOVIE", label: "Movies" },
  { value: "SHOW", label: "Shows" },
];

const DAYS = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

function languageLabel(code: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

function toggleType(current: string[], value: string): string[] {
  if (current.includes(value)) {
    return current.filter((v) => v !== value);
  }
  const next = [...current, value];
  // If all types selected, normalize to empty (= all)
  if (TYPES.every((t) => next.includes(t.value))) return [];
  return next;
}

const FilterBar = memo(function FilterBar({
  type,
  onTypeChange,
  daysBack,
  onDaysBackChange,
  showDaysFilter = true,
  genre,
  onGenreChange,
  genres,
  provider,
  onProviderChange,
  providers,
  language,
  onLanguageChange,
  languages,
  onClearFilters,
  hideTracked,
  onHideTrackedChange,
}: Props) {
  const hasActiveFilters =
    type.length > 0 ||
    (daysBack !== undefined && daysBack !== 30 && showDaysFilter) ||
    (genre && genre.length > 0) ||
    (provider && provider.length > 0) ||
    (language && language.length > 0);
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => onTypeChange([])}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            type.length === 0
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onTypeChange(toggleType(type, t.value))}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              type.includes(t.value)
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {showDaysFilter && onDaysBackChange && (
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {DAYS.map((d) => (
            <button
              key={d.value}
              onClick={() => onDaysBackChange(d.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                daysBack === d.value
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {genres && genres.length > 0 && onGenreChange && (
        <MultiSelectDropdown
          label="All Genres"
          options={genres.map((g) => ({ value: g, label: g }))}
          selected={genre || []}
          onChange={onGenreChange}
        />
      )}
      {providers && providers.length > 0 && onProviderChange && (
        <MultiSelectDropdown
          label="All Platforms"
          options={providers.map((p) => ({ value: String(p.id), label: p.name }))}
          selected={provider || []}
          onChange={onProviderChange}
        />
      )}
      {languages && languages.length > 0 && onLanguageChange && (
        <MultiSelectDropdown
          label="All Languages"
          options={(languages as (string | LanguageOption)[]).map((l) =>
            typeof l === "string"
              ? { value: l, label: languageLabel(l) }
              : { value: l.code, label: l.name }
          )}
          selected={language || []}
          onChange={onLanguageChange}
        />
      )}
      {onHideTrackedChange && (
        <button
          aria-pressed={hideTracked}
          onClick={() => onHideTrackedChange(!hideTracked)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            hideTracked
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          Hide Tracked
        </button>
      )}
      {onClearFilters && hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          Clear filters
        </button>
      )}
    </div>
  );
});

export default FilterBar;
