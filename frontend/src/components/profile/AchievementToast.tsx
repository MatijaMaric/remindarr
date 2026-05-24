import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import * as api from "../../api";
import type { UserAchievement } from "../../types";

const STORAGE_KEY = "lastSeenAchievementAt";
const POLL_INTERVAL_MS = 60_000;
const TOAST_DURATION_MS = 4_000;

export function useNewAchievements(): UserAchievement[] {
  const [newAchievements, setNewAchievements] = useState<UserAchievement[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function check() {
      try {
        const all = await api.getMyAchievements(controller.signal);
        if (controller.signal.aborted) return;

        const lastSeen = localStorage.getItem(STORAGE_KEY);
        const lastSeenDate = lastSeen ? new Date(lastSeen) : null;

        const fresh = all.filter((a) => {
          if (!a.earned || !a.earnedAt) return false;
          if (!lastSeenDate) return true;
          return new Date(a.earnedAt) > lastSeenDate;
        });

        if (fresh.length > 0) {
          setNewAchievements(fresh);
          localStorage.setItem(STORAGE_KEY, new Date().toISOString());
        }
      } catch {
        // ignore — best-effort polling
      }
    }

    // Delay initial check by one tick to avoid synchronous setState inside effect
    const initialTimer = setTimeout(check, 0);
    const intervalId = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  return newAchievements;
}

interface ToastItemProps {
  achievement: UserAchievement;
  onDismiss: () => void;
}

export function ToastItem({ achievement, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-amber-400/30 shadow-lg max-w-xs"
      role="alert"
    >
      <div className="w-9 h-9 rounded-lg bg-amber-400/20 flex items-center justify-center shrink-0">
        <Trophy size={18} className="text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-mono font-semibold uppercase tracking-widest text-amber-400 mb-0.5">
          Achievement unlocked
        </div>
        <div className="text-sm font-bold text-zinc-100 truncate">
          {achievement.title}
        </div>
        <div className="text-xs text-zinc-400 truncate">
          {achievement.description}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss achievement notification"
        className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function AchievementToast() {
  const newAchievements = useNewAchievements();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = (key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  };

  const visible = newAchievements.filter((a) => !dismissed.has(a.key));

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 sm:bottom-6">
      {visible.map((a) => (
        <ToastItem
          key={a.key}
          achievement={a}
          onDismiss={() => dismiss(a.key)}
        />
      ))}
    </div>
  );
}
