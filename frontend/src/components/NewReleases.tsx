import { useState, useEffect, useCallback } from "react";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";

export default function NewReleases() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [type, setType] = useState("");
  const [daysBack, setDaysBack] = useState(30);
  const [error, setError] = useState("");

  const fetchTitles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getTitles({ daysBack, type: type || undefined });
      setTitles(res.titles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [daysBack, type]);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      const res = await api.syncReleases(daysBack, type || undefined);
      alert(res.message);
      await fetchTitles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar
          type={type}
          onTypeChange={setType}
          daysBack={daysBack}
          onDaysBackChange={setDaysBack}
        />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {syncing ? "Syncing..." : "Sync New Releases"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <TitleList
          titles={titles}
          onTrackToggle={fetchTitles}
          emptyMessage="No releases found. Click 'Sync New Releases' to fetch data from JustWatch."
        />
      )}
    </div>
  );
}
