import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import FullBleedCarousel from "./FullBleedCarousel";
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
          <Link
            key={title.id}
            to={`/title/${title.id}`}
            className="w-32 flex-shrink-0 group"
            style={{ scrollSnapAlign: "start" }}
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
              {title.posterUrl ? (
                <img
                  src={title.posterUrl}
                  alt={title.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  width={128}
                  height={192}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  N/A
                </div>
              )}
            </div>
            <p className="text-sm text-white mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
              {title.title}
            </p>
          </Link>
        ))}
      </FullBleedCarousel>
    </section>
  );
}
