import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { groupShowsByStatus } from "../lib/groupShows";
import { useGridNavigation } from "../hooks/useGridNavigation";

export default function TrackedPage() {
  const { data, loading, refetch } = useApiCall(() => api.getTrackedTitles(), []);
  const titles: Title[] = useMemo(() => data?.titles ?? [], [data]);
  const { t } = useTranslation();
  useGridNavigation();

  const { showGroups, movies } = useMemo(() => {
    const shows = titles.filter((t) => t.object_type === "SHOW");
    const movieList = titles
      .filter((t) => t.object_type === "MOVIE")
      .sort((a, b) => {
        if (!a.tracked_at && !b.tracked_at) return 0;
        if (!a.tracked_at) return 1;
        if (!b.tracked_at) return -1;
        return b.tracked_at.localeCompare(a.tracked_at);
      });
    return { showGroups: groupShowsByStatus(shows), movies: movieList };
  }, [titles]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("tracked.title", { count: titles.length })}</h2>
      {loading ? (
        <TitleGridSkeleton />
      ) : titles.length === 0 ? (
        <TitleList titles={[]} onTrackToggle={refetch} emptyMessage={t("tracked.empty")} />
      ) : (
        <div className="space-y-6">
          {showGroups.map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                {t(group.labelKey)} ({group.titles.length})
              </h3>
              <TitleList titles={group.titles} onTrackToggle={refetch} hideTypeBadge showProgressBar showStatusPicker showNotificationPicker showTags />
            </div>
          ))}
          {movies.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                {t("tracked.sections.movies")} ({movies.length})
              </h3>
              <TitleList titles={movies} onTrackToggle={refetch} showStatusPicker showTags />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
