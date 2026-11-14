import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

interface Props {
  onSearch: (query: string) => void;
  onImdb: (url: string) => void;
  loading?: boolean;
  initialQuery?: string;
}

const IMDB_REGEX = /imdb\.com\/title\/tt\d+/i;

export default function SearchBar({
  onSearch,
  onImdb,
  loading,
  initialQuery = "",
}: Props) {
  const [value, setValue] = useState(initialQuery);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      inputRef.current?.focus();
      setSearchParams(
        (p) => {
          p.delete("focus");
          return p;
        },
        { replace: true },
      );
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
        className="flex-1 bg-card border border-border rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-md transition-colors cursor-pointer"
      >
        {loading ? "..." : t("search.button")}
      </button>
    </form>
  );
}
