import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";

export default function TrackedPage() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  const fetchTracked = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTrackedTitles();
      setTitles(res.titles);
    } catch (err) {
      console.error("Failed to fetch tracked titles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracked();
  }, [fetchTracked]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("tracked.title", { count: titles.length })}</h2>
      {loading ? (
        <TitleGridSkeleton />
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={fetchTracked}
          emptyMessage={t("tracked.empty")}
        />
      )}
    </div>
  );
}
