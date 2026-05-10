interface EarnEntry {
  earnedAt: string;
  context: Record<string, unknown> | null;
}

interface EarnHistoryListProps {
  history: EarnEntry[];
}

function formatContext(context: Record<string, unknown> | null): string | null {
  if (!context) return null;
  if (typeof context.month === "string") return context.month;
  if (typeof context.week === "string") return context.week;
  return null;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

export function EarnHistoryList({ history }: EarnHistoryListProps) {
  if (history.length === 0) return null;
  return (
    <div className="space-y-2">
      {history.map((entry, i) => {
        const ctx = formatContext(entry.context);
        const date = new Date(entry.earnedAt);
        const relative = formatRelativeTime(date);
        return (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-300">{ctx ?? relative}</span>
            <span className="text-zinc-500">{date.toLocaleDateString()}</span>
          </div>
        );
      })}
    </div>
  );
}
