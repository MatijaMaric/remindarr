export type BrowseCategory = "new_releases" | "popular" | "upcoming" | "top_rated";

const CATEGORIES: { value: BrowseCategory; label: string }[] = [
  { value: "new_releases", label: "New Releases" },
  { value: "popular", label: "Popular" },
  { value: "upcoming", label: "Upcoming" },
  { value: "top_rated", label: "Top Rated" },
];

interface Props {
  category: BrowseCategory;
  onCategoryChange: (category: BrowseCategory) => void;
}

export default function CategoryBar({ category, onCategoryChange }: Props) {
  return (
    <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          onClick={() => onCategoryChange(c.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            category === c.value
              ? "bg-amber-500/15 text-amber-400"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
