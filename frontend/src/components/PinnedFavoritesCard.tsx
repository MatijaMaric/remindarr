import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { PinnedTitle } from "../types";
import * as api from "../api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function reorderPinned(items: PinnedTitle[], fromId: string, toId: string): PinnedTitle[] {
  const oldIdx = items.findIndex((t) => t.id === fromId);
  const newIdx = items.findIndex((t) => t.id === toId);
  if (oldIdx < 0 || newIdx < 0) return items;
  return arrayMove(items, oldIdx, newIdx).map((t, i) => ({ ...t, position: i }));
}

interface SortableTileProps {
  title: PinnedTitle;
  onUnpin: (id: string) => void;
  saving: boolean;
}

function SortableTile({ title, onUnpin, saving }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: title.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative touch-none cursor-grab active:cursor-grabbing"
    >
      {title.poster_url ? (
        <img
          src={title.poster_url}
          alt={title.title}
          className="w-full rounded-lg aspect-[2/3] object-cover border border-white/[0.06]"
          draggable={false}
        />
      ) : (
        <div className="w-full rounded-lg aspect-[2/3] bg-zinc-800 flex items-center justify-center border border-white/[0.06]">
          <span className="text-zinc-600 text-xs text-center px-1 line-clamp-2">{title.title}</span>
        </div>
      )}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onUnpin(title.id)}
        disabled={saving}
        className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-red-400 text-[10px] hover:bg-red-900/70 transition-colors disabled:opacity-30 z-20 cursor-pointer"
        title="Unpin"
        aria-label={`Unpin ${title.title}`}
      >
        ✕
      </button>
    </div>
  );
}

interface Props {
  pinned: PinnedTitle[];
  isOwnProfile: boolean;
  onPinnedChanged?: (next: PinnedTitle[]) => void;
}

export default function PinnedFavoritesCard({ pinned, isOwnProfile, onPinnedChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [localPinned, setLocalPinned] = useState<PinnedTitle[]>(pinned);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const displayed = editing ? localPinned : pinned;
  const showGrid = displayed.length > 0;

  if (!showGrid && !isOwnProfile) return null;

  const visibleItems = editing ? displayed : displayed.slice(0, 4);

  async function handleUnpin(titleId: string) {
    setSaving(true);
    try {
      await api.unpinTitle(titleId);
      const next = localPinned
        .filter((t) => t.id !== titleId)
        .map((t, i) => ({ ...t, position: i }));
      setLocalPinned(next);
      onPinnedChanged?.(next);
      toast.success("Removed from pinned favorites");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unpin title";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = reorderPinned(localPinned, String(active.id), String(over.id));
    const previous = localPinned;
    setLocalPinned(next);
    onPinnedChanged?.(next);

    setSaving(true);
    try {
      await api.reorderPinnedTitles(next.map((t) => t.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reorder";
      toast.error(msg);
      setLocalPinned(previous);
      onPinnedChanged?.(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">
          Favorites
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
        editing ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleItems.map((t) => t.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-4 gap-2">
                {visibleItems.map((title) => (
                  <SortableTile
                    key={title.id}
                    title={title}
                    onUnpin={handleUnpin}
                    saving={saving}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {visibleItems.map((title) => (
              <div key={title.id} className="relative">
                <Link to={`/title/${title.id}`}>
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
              </div>
            ))}
            {isOwnProfile &&
              displayed.length < 4 &&
              Array.from({ length: 4 - displayed.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-full rounded-lg aspect-[2/3] bg-zinc-800/40 border border-dashed border-zinc-700/50 flex items-center justify-center"
                >
                  <span className="text-zinc-700 text-lg">+</span>
                </div>
              ))}
          </div>
        )
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
