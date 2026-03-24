import { useState } from "react";
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
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search.placeholder")}
        className="flex-1 bg-zinc-900 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
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
