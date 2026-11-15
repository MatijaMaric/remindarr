import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as api from "../api";
import TitleList from "./TitleList";

export const NEW_RELEASES_PAGE_SIZE = 100;

interface Props {
  type: string[];
  daysBack: number;
  genre: string[];
  provider: string[];
  language: string[];
  hideTracked?: boolean;
  showProviderBadge?: boolean;
  showRating?: boolean;
  /** Loaded count once every page is in; null while more pages remain. */
  onResultsCount?: (count: number | null) => void;
  onlyMine?: boolean;
}

export default function NewReleases({
  type,
  daysBack,
  genre,
  provider,
  language,
  hideTracked,
  showProviderBadge,
  showRating,
  onResultsCount,
  onlyMine,
}: Props) {
  const { t } = useTranslation();
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "titles",
      daysBack,
      type,
      genre,
      provider,
      language,
      hideTracked,
      onlyMine,
    ],
    queryFn: ({ pageParam, signal }) =>
      api.getTitles(
        {
          daysBack,
          type: type.length ? type.join(",") : undefined,
          genre: genre.length ? genre.join(",") : undefined,
          provider: provider.length ? provider.join(",") : undefined,
          language: language.length ? language.join(",") : undefined,
          excludeTracked: hideTracked || undefined,
          onlyMine: onlyMine || undefined,
          limit: NEW_RELEASES_PAGE_SIZE,
          offset: pageParam,
        },
        signal,
      ),
    initialPageParam: 0,
    // ponytail: a full page means "maybe more"; one empty extra request at worst.
    getNextPageParam: (last, pages) =>
      last.titles.length < NEW_RELEASES_PAGE_SIZE
        ? undefined
        : pages.length * NEW_RELEASES_PAGE_SIZE,
  });

  const titles = useMemo(
    () => data?.pages.flatMap((p) => p.titles) ?? [],
    [data],
  );

  useEffect(() => {
    if (!data) return;
    onResultsCount?.(hasNextPage ? null : titles.length);
  }, [data, hasNextPage, titles.length, onResultsCount]);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("releases.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && titles.length === 0 ? (
        <div
          role="alert"
          className="bg-destructive-soft border border-destructive/40 text-destructive px-4 py-2 rounded-md text-sm"
        >
          {error.message}
        </div>
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={() => void refetch()}
          emptyMessage={t("releases.empty")}
          showProviderBadge={showProviderBadge}
          showRating={showRating}
          applyContentAdvisory
        />
      )}
      {hasNextPage && (
        <div className="text-center py-4">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-fill-subtle border border-border text-foreground-secondary px-6 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50"
          >
            {isFetchingNextPage
              ? t("releases.loading")
              : t("releases.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
