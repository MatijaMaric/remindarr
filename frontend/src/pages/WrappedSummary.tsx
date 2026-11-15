import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { YearInReview, YearInReviewTitleRef } from "../types";
import { HorizontalBar, OverviewCard } from "./StatsPage";

type Review = Omit<YearInReview, "years">;

/** A year with nothing logged: the summary shows only an empty message. */
export function isEmptyReview(data: Review): boolean {
  return (
    data.movies_watched === 0 &&
    data.episodes_watched === 0 &&
    data.watch_time_minutes === 0
  );
}

export function formatWatchHours(minutes: number): string {
  if (minutes === 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function posterSrc(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `https://image.tmdb.org/t/p/w342${url}`;
}

function formatWatchDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function TitleRow({
  item,
  meta,
}: {
  item: YearInReviewTitleRef;
  meta: string;
}) {
  const src = posterSrc(item.poster_url);
  return (
    <Link
      to={`/title/${item.title_id}`}
      className="flex items-center gap-3 rounded-md hover:bg-muted/60 p-1 -m-1"
    >
      <div className="w-10 h-14 rounded-sm bg-muted overflow-hidden shrink-0">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {item.title}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {meta}
        </div>
      </div>
    </Link>
  );
}

export function WrappedSummary({ data }: { data: Review }) {
  const { t } = useTranslation();

  if (isEmptyReview(data)) {
    return (
      <p className="text-muted-foreground text-sm py-12 text-center">
        {t("wrapped.empty", { year: data.year })}
      </p>
    );
  }

  const maxGenre = data.top_genres[0]?.count ?? 0;
  const maxProvider = data.top_providers[0]?.count ?? 0;
  // With one title all year, First and Last watch would be the same card.
  const lastWatch =
    data.last_watch && data.last_watch.title_id !== data.first_watch?.title_id
      ? data.last_watch
      : null;
  // A one-day run is not a binge, and repeats whatever Top shows says.
  const binge =
    data.longest_binge && data.longest_binge.days >= 2
      ? data.longest_binge
      : null;

  return (
    <div className="space-y-8 pb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <OverviewCard
          label={t("wrapped.hours")}
          value={formatWatchHours(data.watch_time_minutes)}
        />
        <OverviewCard label={t("wrapped.movies")} value={data.movies_watched} />
        <OverviewCard
          label={t("wrapped.episodes")}
          value={data.episodes_watched}
        />
      </div>

      {!!data.watch_time_unknown_episodes && (
        <p className="text-sm text-muted-foreground">
          {t("watchTime.unknownEpisodes", {
            count: data.watch_time_unknown_episodes,
          })}
        </p>
      )}

      {(data.first_watch || lastWatch) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.first_watch && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.firstWatch")}
              </h3>
              <TitleRow
                item={data.first_watch}
                meta={formatWatchDate(data.first_watch.watched_at)}
              />
            </div>
          )}
          {lastWatch && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.lastWatch")}
              </h3>
              <TitleRow
                item={lastWatch}
                meta={formatWatchDate(lastWatch.watched_at)}
              />
            </div>
          )}
        </div>
      )}

      {data.top_shows.length > 0 && (
        <div className="bg-card rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">{t("wrapped.topShows")}</h3>
          <div className="space-y-3">
            {data.top_shows.map((show) => (
              <TitleRow
                key={show.title_id}
                item={show}
                meta={t("stats.episodeCount", { count: show.count })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.top_genres.length > 0 && (
          <div className="bg-card rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("wrapped.topGenres")}</h3>
            <div className="space-y-2">
              {data.top_genres.map((g) => (
                <HorizontalBar
                  key={g.genre}
                  label={g.genre}
                  count={g.count}
                  max={maxGenre}
                />
              ))}
            </div>
          </div>
        )}
        {data.top_providers.length > 0 && (
          <div className="bg-card rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">
                {t("wrapped.streamingOn")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("wrapped.streamingOnHint")}
              </p>
            </div>
            <div className="space-y-2">
              {data.top_providers.map((p) => (
                <HorizontalBar
                  key={p.provider_id}
                  label={p.name}
                  count={p.count}
                  max={maxProvider}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {(binge || data.most_rewatched) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {binge && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.longestBinge")}
              </h3>
              <TitleRow
                item={binge}
                meta={t("wrapped.bingeMeta", {
                  days: binge.days,
                  episodes: binge.episodes,
                })}
              />
            </div>
          )}
          {data.most_rewatched && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.mostRewatched")}
              </h3>
              <TitleRow
                item={data.most_rewatched}
                meta={t("wrapped.rewatches", {
                  count: data.most_rewatched.rewatches,
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
