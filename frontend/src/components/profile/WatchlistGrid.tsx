import { useTranslation } from "react-i18next";
import WatchlistCard from "./WatchlistCard";
import type { Title } from "../../types";

interface WatchlistGridProps {
  titles: Title[];
}

export default function WatchlistGrid({ titles }: WatchlistGridProps) {
  const { t } = useTranslation();
  if (titles.length === 0) {
    return (
      <p className="text-zinc-500 text-center py-10 text-sm" data-testid="watchlist-empty">
        {t("userProfile.dossier.emptyTab")}
      </p>
    );
  }
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5"
      data-testid="watchlist-grid"
    >
      {titles.map((title) => (
        <WatchlistCard key={title.id} title={title} />
      ))}
    </div>
  );
}
