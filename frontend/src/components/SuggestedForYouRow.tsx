import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import FullBleedCarousel from "./FullBleedCarousel";
import { MediaCard } from "./MediaCard";
import { Kicker } from "./design";

export default function SuggestedForYouRow() {
  const { t } = useTranslation();

  const { data: aggregate, isLoading } = useQuery({
    queryKey: ["suggestions", 60],
    queryFn: ({ signal }) => api.getSuggestionsAggregate({ limit: 60 }, signal),
    staleTime: 5 * 60_000,
  });
  const titles = aggregate?.flat.slice(0, 20) ?? [];

  if (isLoading || titles.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <Kicker>For you</Kicker>
          <h2 className="text-xl font-bold tracking-[-0.01em]">{t("suggestions.forYou")}</h2>
        </div>
        <Link to="/discovery" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
          View all →
        </Link>
      </div>
      <FullBleedCarousel>
        {titles.map((title) => (
          <div
            key={title.id}
            className="w-52 flex-shrink-0"
            style={{ scrollSnapAlign: "start" }}
          >
            <MediaCard
              aspect="poster"
              hoverZoom
              to={`/title/${title.id}`}
              imageUrl={title.posterUrl}
              imageAlt={title.title}
              title={title.title}
              titleClamp={2}
            />
          </div>
        ))}
      </FullBleedCarousel>
    </section>
  );
}
