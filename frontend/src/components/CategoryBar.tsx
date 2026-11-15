import { useTranslation } from "react-i18next";
import { Pill } from "../components/design";

export type BrowseCategory =
  | "new_releases"
  | "popular"
  | "upcoming"
  | "top_rated";

// Same keys as the list heading, so the pill and the heading always match.
const CATEGORIES: BrowseCategory[] = [
  "popular",
  "upcoming",
  "top_rated",
  "new_releases",
];

interface Props {
  category: BrowseCategory;
  onCategoryChange: (category: BrowseCategory) => void;
}

export default function CategoryBar({ category, onCategoryChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <Pill
          key={c}
          active={category === c}
          onClick={() => onCategoryChange(c)}
        >
          {t(`browse.categories.${c}`)}
        </Pill>
      ))}
    </div>
  );
}
