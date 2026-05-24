import { useEffect, useState } from "react";
import { Trophy, Star } from "lucide-react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/profile/atoms/Avatar";
import type { LeaderboardEntry } from "../types";

function PodiumSpot({
  entry,
  currentUserId,
}: {
  entry: LeaderboardEntry;
  currentUserId: string | undefined;
}) {
  const isMe = entry.userId === currentUserId;
  const rankColors: Record<number, string> = {
    1: "text-amber-400",
    2: "text-zinc-300",
    3: "text-amber-700",
  };
  const textColor = rankColors[entry.rank] ?? "text-zinc-400";

  return (
    <div
      className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border ${
        isMe
          ? "border-amber-400/40 bg-amber-400/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <span className={`font-mono text-2xl font-extrabold ${textColor}`}>
        #{entry.rank}
      </span>
      <Avatar
        username={entry.username}
        displayName={entry.name}
        image={entry.image}
        size={48}
      />
      <div className="text-center min-w-0">
        <div className="text-sm font-bold text-zinc-100 truncate max-w-[120px]">
          {entry.name ?? entry.username}
        </div>
        <div className="font-mono text-xs text-zinc-400 truncate">
          @{entry.username}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Star size={13} className="text-amber-400" />
        <span className="font-mono text-sm font-bold text-amber-400">
          {entry.xp} XP
        </span>
      </div>
      <div className="font-mono text-xs text-zinc-500">
        {entry.badgeCount} badge{entry.badgeCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getLeaderboard(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setEntries(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 bg-zinc-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-900/40 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!entries || entries.length <= 1) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-amber-400 font-semibold mb-1">
            Leaderboard
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Leaderboard
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Among people you follow</p>
        </div>
        <div className="text-center py-12">
          <Trophy size={40} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-1">No rankings yet.</p>
          <p className="text-zinc-500 text-sm">
            Track titles and follow people to appear on the leaderboard.
          </p>
        </div>
      </div>
    );
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Reorder podium for visual display: 2nd left, 1st center, 3rd right
  const podiumDisplay =
    podium.length === 3 ? [podium[1]!, podium[0]!, podium[2]!] : podium;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-amber-400 font-semibold mb-1">
          Leaderboard
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Leaderboard</h1>
        <p className="text-zinc-400 text-sm mt-1">Among people you follow</p>
      </div>

      {/* Podium */}
      <div
        className={`grid gap-3 ${podium.length === 3 ? "grid-cols-3" : podium.length === 2 ? "grid-cols-2" : "grid-cols-1 max-w-xs mx-auto"}`}
      >
        {podiumDisplay.map((entry) => (
          <PodiumSpot
            key={entry.userId}
            entry={entry}
            currentUserId={user?.id}
          />
        ))}
      </div>

      {/* Ranked list */}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          {rest.map((entry) => {
            const isMe = entry.userId === user?.id;
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  isMe
                    ? "border-amber-400/30 bg-amber-400/[0.05]"
                    : "border-white/[0.05] bg-white/[0.02]"
                }`}
              >
                <span className="font-mono text-sm font-bold text-zinc-500 w-6 shrink-0">
                  #{entry.rank}
                </span>
                <Avatar
                  username={entry.username}
                  displayName={entry.name}
                  image={entry.image}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-100 truncate">
                    {entry.name ?? entry.username}
                  </div>
                  <div className="font-mono text-xs text-zinc-500 truncate">
                    @{entry.username}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold text-amber-400">
                    {entry.xp} XP
                  </div>
                  <div className="font-mono text-xs text-zinc-500">
                    {entry.badgeCount} badges
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
