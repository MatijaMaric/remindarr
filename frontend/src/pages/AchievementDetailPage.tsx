import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyAchievementDetail, getUserAchievementDetail } from "../api";
import { BadgeTile } from "../components/achievements/BadgeTile";
import { LadderProgress } from "../components/achievements/LadderProgress";
import { EarnHistoryList } from "../components/achievements/EarnHistoryList";
import { Kicker } from "../components/design/Kicker";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

export default function AchievementDetailPage() {
  const { username, key } = useParams<{ username?: string; key: string }>();
  const isOwnProfile = !username;

  const { data, isLoading: loading, isError: error } = useQuery({
    queryKey: ["achievement", username ?? "me", key],
    queryFn: ({ signal }) =>
      isOwnProfile
        ? getMyAchievementDetail(key!, signal)
        : getUserAchievementDetail(username!, key!, signal),
    enabled: !!key,
  });

  const backHref = username ? `/u/${username}/achievements` : "/achievements";

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-6 w-32 bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="h-48 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-zinc-400">
        Achievement not found.
        <Link to={backHref} className="ml-2 text-amber-400 hover:underline">Back</Link>
      </div>
    );
  }

  const isLadder = data.tier === "ladder" && data.ladder != null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link to={backHref} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ChevronLeft className="w-4 h-4" />
        All achievements
      </Link>

      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <BadgeTile achievement={data} mode={isOwnProfile ? "self" : "other"} compact={false} baseHref={backHref} />
        </div>
        <div className="space-y-1 min-w-0">
          <Kicker>{data.category}</Kicker>
          <h1 className="text-2xl font-bold text-zinc-100">{data.title}</h1>
          <p className="text-zinc-400 text-sm">{data.description}</p>
          {data.rarity && (
            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/30">
              {data.rarity.bucket} · {data.rarity.pct}% earned
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {isOwnProfile && !data.earned && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Progress</span>
            <span>{data.progress} / {data.threshold}</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${Math.min(100, (data.progress / data.threshold) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {data.earned && (
        <p className="text-sm text-zinc-400">
          First earned {data.earnedAt ? new Date(data.earnedAt).toLocaleDateString() : "—"}
        </p>
      )}

      {/* Ladder rung dots */}
      {isLadder && data.ladder && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Ladder progress</p>
          <LadderProgress rungs={data.ladder.rungs} currentKey={data.key} />
        </div>
      )}

      {/* Earn history for repeatables */}
      {data.repeatable && data.history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Earn history</p>
          <EarnHistoryList history={data.history} />
        </div>
      )}
    </div>
  );
}
