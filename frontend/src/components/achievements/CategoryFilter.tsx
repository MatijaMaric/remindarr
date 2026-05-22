import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import type { Category } from "../../types";

export interface CategoryFilterProps {
  categories: Category[];
  className?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  watching: "Watching",
  streaks: "Streaks",
  genres: "Genres",
  social: "Social",
  special: "Special",
  explorer: "Explorer",
  habit: "Habit",
  "long-haul": "Long Haul",
};

export function CategoryFilter({ categories, className }: CategoryFilterProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCat = searchParams.get("cat");

  function selectAll() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("cat");
      return next;
    });
  }

  function selectCategory(cat: Category) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("cat", cat);
      return next;
    });
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <button
        onClick={selectAll}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
          activeCat === null
            ? "bg-white/10 text-white"
            : "text-zinc-400 hover:text-white hover:bg-white/5",
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => selectCategory(cat)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
            activeCat === cat
              ? "bg-white/10 text-white"
              : "text-zinc-400 hover:text-white hover:bg-white/5",
          )}
        >
          {CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );
}
