import { useState, useEffect, useCallback } from "react";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";

export default function TrackedPage() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

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
      <h2 className="text-lg font-semibold">Tracked Titles ({titles.length})</h2>
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={fetchTracked}
          emptyMessage="No tracked titles yet. Search for titles and click 'Track' to add them here."
        />
      )}
    </div>
  );
}
