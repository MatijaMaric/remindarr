import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

interface Props {
  onSearch: (query: string) => void;
  onImdb: (url: string) => void;
  loading?: boolean;
}

const IMDB_REGEX = /imdb\.com\/title\/tt\d+/i;

export default function SearchBar({ onSearch, onImdb, loading }: Props) {
  const [value, setValue] = useState("");
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      inputRef.current?.focus();
      setSearchParams((p) => { p.delete("focus"); return p; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    if (IMDB_REGEX.test(trimmed) || /^tt\d+$/.test(trimmed)) {
      onImdb(trimmed);
    } else {
      onSearch(trimmed);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        ref={inputRef}
        id="search-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        className="flex-1 bg-zinc-900 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-medium rounded-lg transition-colors cursor-pointer"
      >
        {loading ? "..." : t("search.button")}
      </button>
    </form>
  );
}
