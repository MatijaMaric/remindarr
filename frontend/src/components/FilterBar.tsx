interface ProviderOption {
  id: number;
  name: string;
}

interface LanguageOption {
  code: string;
  name: string;
}

interface Props {
  type: string;
  onTypeChange: (type: string) => void;
  daysBack?: number;
  onDaysBackChange?: (days: number) => void;
  showDaysFilter?: boolean;
  genre?: string;
  onGenreChange?: (genre: string) => void;
  genres?: string[];
  provider?: string;
  onProviderChange?: (provider: string) => void;
  providers?: ProviderOption[];
  language?: string;
  onLanguageChange?: (language: string) => void;
  languages?: string[] | LanguageOption[];
}

const TYPES = [
  { value: "", label: "All" },
  { value: "MOVIE", label: "Movies" },
  { value: "SHOW", label: "Shows" },
];

const DAYS = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const selectClass =
  "bg-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 border-0 outline-none cursor-pointer appearance-none hover:text-white focus:ring-1 focus:ring-gray-600";

function languageLabel(code: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

export default function FilterBar({
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
}: Props) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onTypeChange(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              type === t.value
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
        <select
          value={genre || ""}
          onChange={(e) => onGenreChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All Genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}
      {providers && providers.length > 0 && onProviderChange && (
        <select
          value={provider || ""}
          onChange={(e) => onProviderChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All Platforms</option>
          {providers.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {languages && languages.length > 0 && onLanguageChange && (
        <select
          value={language || ""}
          onChange={(e) => onLanguageChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All Languages</option>
          {languages.map((l) =>
            typeof l === "string" ? (
              <option key={l} value={l}>
                {languageLabel(l)}
              </option>
            ) : (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            )
          )}
        </select>
      )}
    </div>
  );
}
