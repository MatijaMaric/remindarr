import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

export default function TrackedPage() {
  const { data, loading, refetch } = useApiCall(() => api.getTrackedTitles(), []);
  const titles: Title[] = data?.titles ?? [];
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("tracked.title", { count: titles.length })}</h2>
      {loading ? (
        <TitleGridSkeleton />
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={refetch}
          emptyMessage={t("tracked.empty")}
        />
      )}
    </div>
  );
}
