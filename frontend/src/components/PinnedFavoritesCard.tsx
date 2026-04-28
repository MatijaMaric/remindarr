import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { PinnedTitle } from "../types";
import * as api from "../api";

interface Props {
  pinned: PinnedTitle[];
  isOwnProfile: boolean;
  onPinnedChanged?: () => void;
}

export default function PinnedFavoritesCard({ pinned, isOwnProfile, onPinnedChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [localPinned, setLocalPinned] = useState<PinnedTitle[]>(pinned);
  const [saving, setSaving] = useState(false);

  // Keep local state in sync if parent refreshes the pinned list
  // (only when not actively editing, so we don't clobber edits)
  const displayed = editing ? localPinned : pinned;
  const showGrid = displayed.length > 0;

  if (!showGrid && !isOwnProfile) return null;

  async function handleUnpin(titleId: string) {
    setSaving(true);
    try {
      await api.unpinTitle(titleId);
      const next = localPinned.filter((t) => t.id !== titleId);
      setLocalPinned(next);
      onPinnedChanged?.();
      toast.success("Removed from pinned favorites");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unpin title";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(titleId: string, direction: "up" | "down") {
    const idx = localPinned.findIndex((t) => t.id === titleId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= localPinned.length) return;

    const next = [...localPinned];
    const tmp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = tmp;
    const reordered = next.map((t, i) => ({ ...t, position: i }));
    setLocalPinned(reordered);

    setSaving(true);
    try {
      await api.reorderPinnedTitles(reordered.map((t) => t.id));
      onPinnedChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reorder";
      toast.error(msg);
      setLocalPinned(localPinned); // revert
    } finally {
      setSaving(false);
    }
  }

  // Show up to 4 for display; all 8 when editing
  const visibleItems = editing ? displayed : displayed.slice(0, 4);

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">
          Favorite Films
        </h3>
        {isOwnProfile && displayed.length > 0 && (
          <button
            onClick={() => {
              setLocalPinned(pinned);
              setEditing((e) => !e);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {showGrid ? (
        <div className="grid grid-cols-4 gap-2">
          {visibleItems.map((title, idx) => (
            <div key={title.id} className="relative group">
              <Link to={`/details/${title.object_type === "MOVIE" ? "movie" : "show"}/${title.id}`}>
                {title.poster_url ? (
                  <img
                    src={title.poster_url}
                    alt={title.title}
                    className="w-full rounded-lg aspect-[2/3] object-cover border border-white/[0.06] hover:border-amber-400/40 transition-colors"
                  />
                ) : (
                  <div className="w-full rounded-lg aspect-[2/3] bg-zinc-800 flex items-center justify-center border border-white/[0.06]">
                    <span className="text-zinc-600 text-xs text-center px-1 line-clamp-2">
                      {title.title}
                    </span>
                  </div>
                )}
              </Link>

              {editing && (
                <div className="absolute inset-0 rounded-lg bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleMove(title.id, "up")}
                    disabled={saving || idx === 0}
                    className="text-white text-xs bg-zinc-700/80 rounded px-2 py-0.5 disabled:opacity-30 cursor-pointer hover:bg-zinc-600 transition-colors"
                    title="Move left"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleUnpin(title.id)}
                    disabled={saving}
                    className="text-red-400 text-xs bg-zinc-700/80 rounded px-2 py-0.5 cursor-pointer hover:bg-red-900/50 transition-colors"
                    title="Unpin"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => handleMove(title.id, "down")}
                    disabled={saving || idx === visibleItems.length - 1}
                    className="text-white text-xs bg-zinc-700/80 rounded px-2 py-0.5 disabled:opacity-30 cursor-pointer hover:bg-zinc-600 transition-colors"
                    title="Move right"
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
          ))}
          {/* Empty slots (show 4 slots when not editing, owner only) */}
          {isOwnProfile && !editing && displayed.length < 4 &&
            Array.from({ length: 4 - displayed.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="w-full rounded-lg aspect-[2/3] bg-zinc-800/40 border border-dashed border-zinc-700/50 flex items-center justify-center"
              >
                <span className="text-zinc-700 text-lg">+</span>
              </div>
            ))
          }
        </div>
      ) : (
        isOwnProfile && (
          <p className="text-xs text-zinc-500 text-center py-4">
            Pin your favorite titles from any title page
          </p>
        )
      )}
    </div>
  );
}
