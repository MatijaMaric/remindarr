import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface ProviderOption {
  id: number;
  name: string;
  iconUrl?: string;
}

interface LanguageOption {
  code: string;
  name: string;
}

interface Props {
  // Primary (4 dropdown fields)
  genre: string[];
  onGenreChange: (genre: string[]) => void;
  genres: string[];

  provider: string[];
  onProviderChange: (provider: string[]) => void;
  providers: ProviderOption[];
  regionProviderIds?: number[];

  yearMin: string;
  yearMax: string;
  onYearChange: (min: string, max: string) => void;

  minRating: string;
  onMinRatingChange: (value: string) => void;

  // Secondary chip row
  type: string[];
  onTypeChange: (type: string[]) => void;

  language: string[];
  onLanguageChange: (language: string[]) => void;
  languages: string[] | LanguageOption[];
  priorityLanguageCodes?: string[];

  hideTracked?: boolean;
  onHideTrackedChange?: (value: boolean) => void;

  onClearFilters: () => void;
}

const RATING_OPTIONS = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5"] as const;

function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

export default function BrowseFilterCard(props: Props) {
  const {
    genre, onGenreChange, genres,
    provider, onProviderChange, providers, regionProviderIds,
    yearMin, yearMax, onYearChange,
    minRating, onMinRatingChange,
    type, onTypeChange,
    language, onLanguageChange, languages, priorityLanguageCodes,
    hideTracked, onHideTrackedChange,
    onClearFilters,
  } = props;
  const { t } = useTranslation();

  const hasActiveFilters =
    genre.length > 0 ||
    provider.length > 0 ||
    language.length > 0 ||
    type.length > 0 ||
    yearMin !== "" ||
    yearMax !== "" ||
    minRating !== "";

  // Genre summary
  const genreSummary = genre.length === 0
    ? "All genres"
    : genre.length <= 2 ? genre.join(", ") : `${genre.length} selected`;

  // Provider summary (use provider names)
  const providerById = useMemo(() => {
    const m = new Map<string, ProviderOption>();
    for (const p of providers) m.set(String(p.id), p);
    return m;
  }, [providers]);
  const providerSummary = provider.length === 0
    ? "All providers"
    : provider.length <= 2
      ? provider.map((id) => providerById.get(id)?.name ?? id).join(", ")
      : `${providerById.get(provider[0])?.name ?? provider[0]}, ${providerById.get(provider[1])?.name ?? provider[1]} +${provider.length - 2}`;

  // Year summary
  const yearSummary = yearMin || yearMax
    ? `${yearMin || "…"} – ${yearMax || "…"}`
    : "Any year";

  // Rating summary
  const ratingSummary = minRating ? `★ ${minRating}+` : "Any rating";

  // Provider sections (region first, then others)
  const providerSections = useMemo(() => {
    if (!providers || providers.length === 0) return [{ label: undefined, options: [] as ProviderOption[] }];
    if (!regionProviderIds || regionProviderIds.length === 0) {
      return [{ label: undefined, options: providers }];
    }
    const regionSet = new Set(regionProviderIds);
    const region = providers.filter((p) => regionSet.has(p.id));
    const other = providers.filter((p) => !regionSet.has(p.id));
    const sections: { label?: string; options: ProviderOption[] }[] = [];
    if (region.length) sections.push({ options: region });
    if (other.length) sections.push({ label: "Other", options: other });
    return sections;
  }, [providers, regionProviderIds]);

  // Language sections
  const languageOptions = useMemo(() => {
    return (languages as (string | LanguageOption)[]).map((l) =>
      typeof l === "string" ? { value: l, label: languageLabel(l) } : { value: l.code, label: l.name }
    );
  }, [languages]);
  const languageSections = useMemo(() => {
    if (!priorityLanguageCodes || priorityLanguageCodes.length === 0) {
      return [{ options: languageOptions }];
    }
    const prioritySet = new Set(priorityLanguageCodes);
    const priority = languageOptions.filter((o) => prioritySet.has(o.value));
    const other = languageOptions.filter((o) => !prioritySet.has(o.value));
    const sections: { label?: string; options: { value: string; label: string }[] }[] = [];
    if (priority.length) sections.push({ options: priority });
    if (other.length) sections.push({ label: "Other", options: other });
    return sections;
  }, [languageOptions, priorityLanguageCodes]);

  const languageSummary = language.length === 0
    ? t("filter.allLanguages")
    : language.length <= 2
      ? language.map((code) => languageLabel(code)).join(", ")
      : `${language.length} selected`;

  return (
    <div className="space-y-3">
      {/* Primary: 4 dropdown fields + Clear */}
      <div className="rounded-xl bg-zinc-900 border border-white/[0.06] p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto] gap-3 items-end">
        <FilterField label="Genre" summary={genreSummary}>
          <CheckboxList
            sections={[{ options: genres.map((g) => ({ value: g, label: g })) }]}
            selected={genre}
            onChange={onGenreChange}
            searchable
          />
        </FilterField>
        <FilterField label="Provider" summary={providerSummary}>
          <CheckboxList
            sections={providerSections.map((s) => ({
              label: s.label,
              options: s.options.map((p) => ({ value: String(p.id), label: p.name, iconUrl: p.iconUrl })),
            }))}
            selected={provider}
            onChange={onProviderChange}
            searchable
          />
        </FilterField>
        <FilterField label="Year" summary={yearSummary}>
          <YearRangeInput
            yearMin={yearMin}
            yearMax={yearMax}
            onChange={onYearChange}
          />
        </FilterField>
        <FilterField label="Min. rating" summary={ratingSummary}>
          <RatingList value={minRating} onChange={onMinRatingChange} />
        </FilterField>
        <button
          type="button"
          onClick={onClearFilters}
          disabled={!hasActiveFilters}
          className="bg-white/[0.06] border border-white/[0.08] text-zinc-300 text-xs font-semibold px-4 py-[9px] rounded-lg hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Secondary chip row: Type / Language / Hide tracked */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Content type" className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
          <button
            aria-pressed={type.length === 0}
            onClick={() => onTypeChange([])}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              type.length === 0 ? "bg-amber-500/15 text-amber-400" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t("filter.all")}
          </button>
          <button
            aria-pressed={type.includes("MOVIE")}
            onClick={() => onTypeChange(type.includes("MOVIE") ? [] : ["MOVIE"])}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              type.includes("MOVIE") ? "bg-amber-500/15 text-amber-400" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t("filter.movies")}
          </button>
          <button
            aria-pressed={type.includes("SHOW")}
            onClick={() => onTypeChange(type.includes("SHOW") ? [] : ["SHOW"])}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              type.includes("SHOW") ? "bg-amber-500/15 text-amber-400" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t("filter.shows")}
          </button>
        </div>

        {languageOptions.length > 0 && (
          <ChipDropdown summary={languageSummary} active={language.length > 0}>
            <CheckboxList
              sections={languageSections}
              selected={language}
              onChange={onLanguageChange}
              searchable
            />
          </ChipDropdown>
        )}

        {onHideTrackedChange && (
          <button
            aria-pressed={hideTracked}
            onClick={() => onHideTrackedChange(!hideTracked)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              hideTracked ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {t("filter.hideTracked")}
          </button>
        )}
      </div>
    </div>
  );
}

function FilterField({
  label,
  summary,
  children,
}: {
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-1.5">
        {label}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-zinc-800 border border-white/[0.05] rounded-md px-3 py-2 text-left text-[13px] text-zinc-200 flex items-center justify-between gap-2 hover:bg-zinc-700/70 cursor-pointer transition-colors"
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

function ChipDropdown({
  summary,
  active,
  children,
}: {
  summary: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
          active
            ? "bg-amber-500/15 text-amber-400"
            : "bg-zinc-800 text-zinc-400 hover:text-white"
        }`}
      >
        {summary}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-[220px] bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

interface CheckboxOption {
  value: string;
  label: string;
  iconUrl?: string;
}

function CheckboxList({
  sections,
  selected,
  onChange,
  searchable = false,
}: {
  sections: { label?: string; options: CheckboxOption[] }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const { t } = useTranslation();
  const lower = query.toLowerCase();

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex flex-col max-h-72">
      {searchable && (
        <div className="sticky top-0 bg-zinc-800 z-10">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filter.search")}
            autoFocus
            className="w-full bg-zinc-700 text-zinc-200 text-xs px-3 py-2 border-0 outline-none placeholder-zinc-500"
          />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>
      )}
      <div className="overflow-y-auto py-1">
        {sections.map((section, idx) => {
          const filtered = section.options.filter((o) => !query || o.label.toLowerCase().includes(lower));
          if (filtered.length === 0) return null;
          return (
            <div key={idx}>
              {idx > 0 && <hr className="border-white/[0.08] my-1" />}
              {section.label && (
                <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  {section.label}
                </div>
              )}
              {filtered.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="rounded border-white/[0.10] bg-zinc-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  {opt.iconUrl && <img src={opt.iconUrl} alt="" className="w-4 h-4 rounded-sm" />}
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearRangeInput({
  yearMin,
  yearMax,
  onChange,
}: {
  yearMin: string;
  yearMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  return (
    <div className="p-3 flex flex-col gap-2 min-w-[220px]">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={yearMin}
          onChange={(e) => onChange(e.target.value, yearMax)}
          placeholder="From"
          min={1900}
          max={2100}
          className="w-full bg-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1.5 border-0 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        <span className="text-zinc-500 text-xs">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={yearMax}
          onChange={(e) => onChange(yearMin, e.target.value)}
          placeholder="To"
          min={1900}
          max={2100}
          className="w-full bg-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1.5 border-0 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {[
          { label: "This year", min: String(currentYear), max: String(currentYear) },
          { label: "Last 5y", min: String(currentYear - 5), max: String(currentYear) },
          { label: "2010s", min: "2010", max: "2019" },
          { label: "2000s", min: "2000", max: "2009" },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.min, preset.max)}
            className="text-[11px] px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
        {(yearMin || yearMax) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="text-[11px] px-2 py-1 rounded text-zinc-400 hover:text-white cursor-pointer ml-auto"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function RatingList({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer ${
          value === "" ? "bg-zinc-700 text-amber-400" : "text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        Any rating
      </button>
      {RATING_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer ${
            value === r ? "bg-zinc-700 text-amber-400" : "text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          <span className="text-amber-400">★</span>
          {r}+
        </button>
      ))}
    </div>
  );
}
