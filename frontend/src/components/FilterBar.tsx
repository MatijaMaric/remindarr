interface Props {
  type: string;
  onTypeChange: (type: string) => void;
  daysBack?: number;
  onDaysBackChange?: (days: number) => void;
  showDaysFilter?: boolean;
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

export default function FilterBar({ type, onTypeChange, daysBack, onDaysBackChange, showDaysFilter = true }: Props) {
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
    </div>
  );
}
