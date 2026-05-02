import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type { SearchTitle } from "../../types";
import ScrollableRow from "../ScrollableRow";
import { TitleCardSkeleton } from "../SkeletonComponents";
import { Section } from "./Section";
import SectionErrorBoundary from "../SectionErrorBoundary";

interface SuggestionsRowProps {
  titleId: string;
  type: "movie" | "show";
}

function SuggestionsRowInner({ titleId, type }: SuggestionsRowProps) {
  const { t } = useTranslation();
  const [titles, setTitles] = useState<SearchTitle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api.getTitleSuggestions(type, titleId, 1, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setTitles(res.titles.slice(0, 20));
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [titleId, type]);

  if (!loading && titles.length === 0) return null;

  return (
    <Section title={t("suggestions.alsoLike")}>
      {loading ? (
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-28 flex-shrink-0">
              <TitleCardSkeleton />
            </div>
          ))}
        </div>
      ) : (
        <ScrollableRow className="gap-3 pb-1">
          {titles.map((title) => (
            <Link
              key={title.id}
              to={`/title/${title.id}`}
              className="w-28 flex-shrink-0 group"
            >
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
                {title.posterUrl ? (
                  <img
                    src={title.posterUrl}
                    alt={title.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                    width={112}
                    height={168}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                    N/A
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
                {title.title}
              </p>
              {title.releaseYear && (
                <p className="font-mono text-[10px] text-zinc-500">{title.releaseYear}</p>
              )}
            </Link>
          ))}
        </ScrollableRow>
      )}
    </Section>
  );
}

export default function SuggestionsRow(props: SuggestionsRowProps) {
  return (
    <SectionErrorBoundary label="suggestions">
      <SuggestionsRowInner {...props} />
    </SectionErrorBoundary>
  );
}
