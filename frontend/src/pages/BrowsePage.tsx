import { useState } from "react";
import SearchBar from "../components/SearchBar";
import NewReleases from "../components/NewReleases";
import CategoryBar, { type BrowseCategory } from "../components/CategoryBar";
import CategoryBrowse from "../components/CategoryBrowse";
import TitleList from "../components/TitleList";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";

const CATEGORY_LABELS: Record<BrowseCategory, string> = {
  new_releases: "New Releases",
  popular: "Popular",
  upcoming: "Upcoming",
  top_rated: "Top Rated",
};

export default function BrowsePage() {
  const [category, setCategory] = useState<BrowseCategory>("popular");
  const [searchResults, setSearchResults] = useState<Title[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function handleSearch(query: string) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.searchTitles(query);
      setSearchResults(res.titles.map(normalizeSearchTitle));
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleImdb(url: string) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.resolveImdb(url);
      if (res.title) {
        setSearchResults([normalizeSearchTitle(res.title)]);
      }
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSearchResults(null);
    setSearchError("");
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} onImdb={handleImdb} loading={searchLoading} />

      <CategoryBar category={category} onCategoryChange={setCategory} />

      {searchError && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {searchError}
        </div>
      )}

      {searchResults !== null ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Search Results ({searchResults.length})</h2>
            <button
              onClick={clearSearch}
              className="text-sm text-gray-400 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
          <TitleList titles={searchResults} emptyMessage="No results found" />
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold mb-4">{CATEGORY_LABELS[category]}</h2>
          {category === "new_releases" ? (
            <NewReleases />
          ) : (
            <CategoryBrowse key={category} category={category} />
          )}
        </div>
      )}
    </div>
  );
}
