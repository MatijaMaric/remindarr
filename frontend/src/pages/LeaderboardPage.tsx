import { useQuery } from "@tanstack/react-query";
import { Trophy, Star } from "lucide-react";
import { Link } from "react-router";
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
    1: "text-primary-text",
    2: "text-foreground-secondary",
    3: "text-primary-text",
  };
  const textColor = rankColors[entry.rank] ?? "text-muted-foreground";

  return (
    <Link
      to={`/user/${entry.username}`}
      className={`flex flex-col items-center gap-2 px-4 py-4 rounded-lg border hover:opacity-90 transition-opacity ${
        isMe
          ? "border-primary-border bg-primary-soft"
          : "border-border bg-fill-subtle"
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
        <div className="text-sm font-bold text-foreground truncate max-w-[120px]">
          {entry.name ?? entry.username}
        </div>
        <div className="font-mono text-xs text-muted-foreground truncate">
          @{entry.username}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Star size={13} className="text-primary-text" />
        <span className="font-mono text-sm font-bold text-primary-text">
          {entry.xp} XP
        </span>
      </div>
      <div className="font-mono text-xs text-muted-foreground">
        {entry.badgeCount} badge{entry.badgeCount !== 1 ? "s" : ""}
      </div>
    </Link>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const {
    data: entries,
    isLoading: loading,
    isError,
    error,
  } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: ({ signal }) => api.getLeaderboard(signal),
  });

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded-sm animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-destructive-soft border border-destructive/40 text-destructive px-4 py-3 rounded-md text-sm">
          {error instanceof Error ? error.message : String(error)}
        </div>
      </div>
    );
  }

  const header = (
    <div>
      <div className="text-xs text-foreground-secondary font-medium mb-1">
        Leaderboard
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">Leaderboard</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Among people you follow
      </p>
    </div>
  );

  if (!entries || entries.length <= 1) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {header}
        <div className="text-center py-12">
          <Trophy size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-1">No rankings yet.</p>
          <p className="text-muted-foreground text-sm">
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
      {header}

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
              <Link
                key={entry.userId}
                to={`/user/${entry.username}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border hover:opacity-90 transition-opacity ${
                  isMe
                    ? "border-primary-border bg-primary-soft"
                    : "border-border bg-fill-subtle"
                }`}
              >
                <span className="font-mono text-sm font-bold text-muted-foreground w-6 shrink-0">
                  #{entry.rank}
                </span>
                <Avatar
                  username={entry.username}
                  displayName={entry.name}
                  image={entry.image}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {entry.name ?? entry.username}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">
                    @{entry.username}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold text-primary-text">
                    {entry.xp} XP
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {entry.badgeCount} badges
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
