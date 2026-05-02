import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { SuggestionsAggregateResponse, SearchTitle } from "../types";
import ScrollableRow from "../components/ScrollableRow";
import FullBleedCarousel from "../components/FullBleedCarousel";
import { Kicker } from "../components/design";
import { TitleCardSkeleton } from "../components/SkeletonComponents";

function PosterCard({ title }: { title: SearchTitle }) {
  return (
    <Link to={`/title/${title.id}`} className="w-32 flex-shrink-0 group" style={{ scrollSnapAlign: "start" }}>
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
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
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">N/A</div>
        )}
      </div>
      <p className="text-sm text-white mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
        {title.title}
      </p>
      {title.releaseYear && (
        <p className="font-mono text-[10px] text-zinc-500">{title.releaseYear}</p>
      )}
    </Link>
  );
}

export default function SuggestionsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<SuggestionsAggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api.getSuggestionsAggregate({ limit: 60 }, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setData(res); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="space-y-10">
        <div>
          <Kicker>For you</Kicker>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{t("suggestions.forYou")}</h1>
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-32 flex-shrink-0">
              <TitleCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || (data.flat.length === 0 && data.groups.length === 0)) {
    return (
      <div className="space-y-8">
        <div>
          <Kicker>For you</Kicker>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{t("suggestions.forYou")}</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <p className="text-zinc-400 text-lg font-semibold">{t("suggestions.empty.title")}</p>
          <p className="text-zinc-500 text-sm max-w-xs">{t("suggestions.empty.cta")}</p>
          <Link
            to="/browse"
            className="mt-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors text-sm"
          >
            Browse titles
          </Link>
        </div>
      </div>
    );
  }

  const heroTitles = data.flat.slice(0, 12);

  return (
    <div className="space-y-10 pb-12">
      <div>
        <Kicker>For you</Kicker>
        <h1 className="text-2xl font-bold tracking-tight mt-1">{t("suggestions.forYou")}</h1>
      </div>

      {/* Hero "For You" row */}
      {heroTitles.length > 0 && (
        <section>
          <FullBleedCarousel>
            {heroTitles.map((title) => (
              <PosterCard key={title.id} title={title} />
            ))}
          </FullBleedCarousel>
        </section>
      )}

      {/* Groups by source title */}
      {data.groups.map((group) => (
        <section key={group.source.id}>
          <div className="flex items-center gap-3 mb-4">
            {group.source.posterUrl && (
              <Link to={`/title/${group.source.id}`} className="shrink-0">
                <img
                  src={group.source.posterUrl}
                  alt={group.source.title}
                  className="w-8 h-12 rounded object-cover"
                  width={32}
                  height={48}
                />
              </Link>
            )}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                {t("suggestions.because", { title: group.source.title })}
              </p>
              <Link
                to={`/title/${group.source.id}`}
                className="text-sm font-semibold text-white hover:text-amber-400 transition-colors"
              >
                {group.source.title}
              </Link>
            </div>
          </div>
          <ScrollableRow className="gap-3 pb-1">
            {group.suggestions.map((title) => (
              <PosterCard key={title.id} title={title} />
            ))}
          </ScrollableRow>
        </section>
      ))}
    </div>
  );
}
