import { Pill } from "../components/design";

export type BrowseCategory = "new_releases" | "popular" | "upcoming" | "top_rated";

const CATEGORIES: { value: BrowseCategory; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "upcoming", label: "Upcoming" },
  { value: "top_rated", label: "Top Rated" },
  { value: "new_releases", label: "Now Playing" },
];

interface Props {
  category: BrowseCategory;
  onCategoryChange: (category: BrowseCategory) => void;
}

export default function CategoryBar({ category, onCategoryChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <Pill
          key={c.value}
          active={category === c.value}
          onClick={() => onCategoryChange(c.value)}
        >
          {c.label}
        </Pill>
      ))}
    </div>
  );
}
