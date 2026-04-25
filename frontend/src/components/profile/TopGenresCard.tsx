import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { ThinProgress } from "./atoms/ThinProgress";
import type { ProfileGenreCount } from "../../types";

interface TopGenresCardProps {
  genres: ProfileGenreCount[];
  limit?: number;
}

export default function TopGenresCard({ genres, limit = 6 }: TopGenresCardProps) {
  const { t } = useTranslation();
  if (genres.length === 0) return null;
  const slice = genres.slice(0, limit);
  const max = Math.max(...slice.map((g) => g.count), 1);

  return (
    <DossierCard>
      <Kicker color="zinc">{t("userProfile.dossier.topGenres")}</Kicker>
      <div className="flex flex-col gap-2.5">
        {slice.map((g) => (
          <div key={g.genre}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-200">{g.genre}</span>
              <span className="font-mono text-zinc-500">{g.count}</span>
            </div>
            <ThinProgress value={g.count} max={max} height={3} />
          </div>
        ))}
      </div>
    </DossierCard>
  );
}
