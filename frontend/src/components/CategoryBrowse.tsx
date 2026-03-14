import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";
import type { BrowseCategory } from "./CategoryBar";

interface Props {
  category: Exclude<BrowseCategory, "new_releases">;
}

export default function CategoryBrowse({ category }: Props) {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  const fetchTitles = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const res = await api.browseTitles({
        category,
        type: type || undefined,
        page: pageNum,
      });
      const normalized = res.titles.map(normalizeSearchTitle);
      if (append) {
        setTitles((prev) => [...prev, ...normalized]);
      } else {
        setTitles(normalized);
      }
      setTotalPages(res.totalPages);
      setPage(pageNum);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, type]);

  useEffect(() => {
    fetchTitles(1, false);
  }, [fetchTitles]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page < totalPages && !loadingMore) {
          fetchTitles(page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, totalPages, loadingMore, fetchTitles]);

  return (
    <div className="space-y-4">
      <FilterBar
        type={type}
        onTypeChange={setType}
        showDaysFilter={false}
      />

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          <TitleList titles={titles} emptyMessage="No titles found." />
          {page < totalPages && (
            <div ref={sentinelRef} className="text-center py-4">
              {loadingMore && (
                <div className="text-gray-500 text-sm">Loading...</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
