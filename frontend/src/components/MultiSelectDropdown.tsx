import { useState, useRef, useEffect } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
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

  useClickOutside(ref, open, () => {
    setOpen(false);
    setQuery("");
  });

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
  const allOptions = sections
    ? sections.flatMap((s) => s.options)
    : options || [];

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
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted-hover cursor-pointer"
      >
        <input
          type="checkbox"
          checked={selected.includes(opt.value)}
          onChange={() => toggle(opt.value)}
          className="rounded-sm border-border bg-muted-hover text-primary-text focus:ring-0 cursor-pointer"
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
            {idx > 0 && <hr className="border-border my-1" />}
            {section.label && (
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
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
        className="bg-muted text-foreground-secondary text-xs rounded-md px-3 py-1.5 border-0 outline-none cursor-pointer hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card flex items-center gap-1"
      >
        {summary}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-muted border border-border rounded-md shadow-lg min-w-[160px] flex flex-col max-h-72">
          <div className="sticky top-0 bg-muted z-10 rounded-t-md">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filter.search")}
              className="w-full bg-muted-hover text-foreground-secondary text-xs rounded-t-md px-3 py-1.5 border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset placeholder-muted-foreground"
            />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted-hover cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="overflow-y-auto py-1">{renderContent()}</div>
        </div>
      )}
    </div>
  );
}
