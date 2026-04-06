import { Undo2, HeartCrack, ThumbsDown, ThumbsUp, Heart } from "lucide-react";
import type { RatingValue } from "../types";

const RATING_OPTIONS: { value: RatingValue; Icon: typeof ThumbsDown; label: string; filled?: boolean }[] = [
  { value: "HATE", Icon: HeartCrack, label: "Hate", filled: true },
  { value: "DISLIKE", Icon: ThumbsDown, label: "Dislike" },
  { value: "LIKE", Icon: ThumbsUp, label: "Like" },
  { value: "LOVE", Icon: Heart, label: "Love", filled: true },
];

export interface ReelsUndoBarProps {
  episodeCode: string;
  currentRating: RatingValue | null;
  onRate: (value: RatingValue) => void;
  onUndo: () => void;
}

export default function ReelsUndoBar({ episodeCode, currentRating, onRate, onUndo }: ReelsUndoBarProps) {
  return (
    <div className="flex items-center gap-2 bg-zinc-800/80 backdrop-blur-sm rounded-xl px-3 py-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span className="text-xs text-zinc-400 whitespace-nowrap mr-auto">
        Marked {episodeCode}
      </span>

      <div className="flex items-center gap-1">
        {RATING_OPTIONS.map(({ value, Icon, label, filled }) => {
          const isActive = currentRating === value;
          return (
            <button
              key={value}
              onClick={() => onRate(value)}
              aria-label={label}
              aria-pressed={isActive}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isActive ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon
                size={16}
                fill={isActive && filled ? "currentColor" : "none"}
                strokeWidth={value === "HATE" ? 2.5 : 2}
              />
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-zinc-600/50" />

      <button
        onClick={onUndo}
        className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer px-1"
        aria-label="Undo"
      >
        <Undo2 size={14} />
        <span className="text-xs font-medium">Undo</span>
      </button>
    </div>
  );
}
