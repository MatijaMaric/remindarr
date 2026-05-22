import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import type { Episode } from "../types";
import {
  groupByShow,
  formatUpcomingDate,
  ShowEpisodeGroup,
} from "../components/EpisodeComponents";
import { EpisodeListSkeleton } from "../components/SkeletonComponents";
import { useIsMobile } from "../hooks/useIsMobile";
import AgendaCalendar from "../components/AgendaCalendar";

export default function UpcomingPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const {
    isLoading: loading,
    isError: error,
    data: upcomingData,
  } = useQuery({
    queryKey: ["upcoming"],
    queryFn: ({ signal }) => api.getUpcomingEpisodes(signal),
  });

  const today = upcomingData?.today ?? [];
  const upcoming = upcomingData?.upcoming ?? [];

  type UpcomingData = { today: Episode[]; upcoming: Episode[] };

  const toggleWatched = async (
    episodeId: number,
    currentlyWatched: boolean,
  ) => {
    const updateEps = (eps: Episode[]) =>
      eps.map((ep) =>
        ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep,
      );
    const revertEps = (eps: Episode[]) =>
      eps.map((ep) =>
        ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep,
      );

    qc.setQueryData<UpcomingData>(["upcoming"], (old) => {
      if (!old) return old;
      return { today: updateEps(old.today), upcoming: updateEps(old.upcoming) };
    });

    try {
      if (currentlyWatched) {
        await api.unwatchEpisode(episodeId);
      } else {
        await api.watchEpisode(episodeId);
      }
    } catch (err) {
      qc.setQueryData<UpcomingData>(["upcoming"], (old) => {
        if (!old) return old;
        return {
          today: revertEps(old.today),
          upcoming: revertEps(old.upcoming),
        };
      });
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  };

  if (isMobile) {
    return (
      <AgendaCalendar
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  }

  if (loading) {
    return <EpisodeListSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
        {t("upcoming.error", "Failed to load episodes")}
      </div>
    );
  }

  const todayByShow = groupByShow(today);
  const upcomingByDate = new Map<string, Episode[]>();
  for (const ep of upcoming) {
    if (!ep.air_date) continue;
    if (!upcomingByDate.has(ep.air_date)) upcomingByDate.set(ep.air_date, []);
    upcomingByDate.get(ep.air_date)!.push(ep);
  }

  const noEpisodes = today.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-8">
      {/* Today's Episodes */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">
          {t("upcoming.today")}
        </h2>
        {today.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            {noEpisodes
              ? t("upcoming.noEpisodes")
              : t("upcoming.noEpisodesToday")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(todayByShow.entries()).map(([titleId, eps]) => (
              <ShowEpisodeGroup
                key={titleId}
                showTitle={eps[0].show_title}
                episodes={eps}
                posterUrl={eps[0].poster_url}
                onToggleWatched={toggleWatched}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Episodes */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            {t("upcoming.comingUp")}
          </h2>
          <div className="space-y-4">
            {Array.from(upcomingByDate.entries()).map(([date, eps]) => {
              const byShow = groupByShow(eps);
              const dateLabel = formatUpcomingDate(date);
              return (
                <div key={date}>
                  <h3 className="text-sm font-medium text-zinc-500 mb-2">
                    {dateLabel === "__TOMORROW__"
                      ? t("episodes.tomorrow")
                      : dateLabel}
                  </h3>
                  <div className="space-y-2">
                    {Array.from(byShow.entries()).map(([titleId, showEps]) => (
                      <ShowEpisodeGroup
                        key={titleId}
                        showTitle={showEps[0].show_title}
                        episodes={showEps}
                        posterUrl={showEps[0].poster_url}
                        compact
                        onToggleWatched={toggleWatched}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
