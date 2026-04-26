import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

export interface Option {
  value: string;
  label: string;
}

export interface Section {
  label?: string;
  options: Option[];
}

interface Props {
  label: string;
  options?: Option[];
  sections?: Section[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function MultiSelectDropdown({
  label,
  options,
  sections,
  selected,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClick);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  function handleToggleOpen() {
    if (open) {
      setOpen(false);
      setQuery("");
    } else {
      setOpen(true);
    }
  }

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  // Resolve all options flat for summary display
  const allOptions = sections ? sections.flatMap((s) => s.options) : options || [];

  const summary =
    selected.length === 0
      ? label
      : selected.length <= 2
        ? selected
            .map((v) => allOptions.find((o) => o.value === v)?.label ?? v)
            .join(", ")
        : `${selected.length} selected`;

  // Filter by search query
  const lowerQuery = query.toLowerCase();
  function matchesQuery(opt: Option): boolean {
    return !query || opt.label.toLowerCase().includes(lowerQuery);
  }

  function renderOption(opt: Option) {
    return (
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
        {opt.label}
      </label>
    );
  }

  function renderContent() {
    if (sections) {
      if (query) {
        // When searching, flatten all sections
        const filtered = allOptions.filter(matchesQuery);
        return filtered.map(renderOption);
      }
      return sections.map((section, idx) => {
        const filtered = section.options.filter(matchesQuery);
        if (filtered.length === 0) return null;
        return (
          <div key={idx}>
            {idx > 0 && <hr className="border-white/[0.08] my-1" />}
            {section.label && (
              <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                {section.label}
              </div>
            )}
            {filtered.map(renderOption)}
          </div>
        );
      });
    }
    // Flat options mode
    const filtered = (options || []).filter(matchesQuery);
    return filtered.map(renderOption);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="bg-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-1.5 border-0 outline-none cursor-pointer hover:text-white focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 flex items-center gap-1"
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
        <div className="absolute z-50 mt-1 bg-zinc-800 border border-white/[0.08] rounded-lg shadow-lg min-w-[160px] flex flex-col max-h-72">
          <div className="sticky top-0 bg-zinc-800 z-10 rounded-t-lg">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filter.search")}
              className="w-full bg-zinc-700 text-zinc-300 text-xs rounded-t-lg px-3 py-1.5 border-0 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset placeholder-zinc-500"
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
          <div className="overflow-y-auto py-1">
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
}
