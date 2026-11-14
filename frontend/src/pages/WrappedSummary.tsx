import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { YearInReview, YearInReviewTitleRef } from "../types";

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-lg p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
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

export function WrappedSummary({ data }: { data: YearInReview }) {
  const { t } = useTranslation();
  const empty =
    data.movies_watched === 0 &&
    data.episodes_watched === 0 &&
    data.watch_time_minutes === 0;

  if (empty) {
    return (
      <p className="text-muted-foreground text-sm py-12 text-center">
        {t("wrapped.empty", { year: data.year })}
      </p>
    );
  }

  const maxGenre = data.top_genres[0]?.count ?? 0;
  const maxProvider = data.top_providers[0]?.count ?? 0;

  return (
    <div className="space-y-8 pb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label={t("wrapped.hours")}
          value={formatWatchHours(data.watch_time_minutes)}
        />
        <StatCard label={t("wrapped.movies")} value={data.movies_watched} />
        <StatCard label={t("wrapped.episodes")} value={data.episodes_watched} />
      </div>

      {!!data.watch_time_unknown_episodes && (
        <p className="text-sm text-muted-foreground">
          {t("watchTime.unknownEpisodes", {
            count: data.watch_time_unknown_episodes,
          })}
        </p>
      )}

      {(data.first_watch || data.last_watch) && (
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
          {data.last_watch && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.lastWatch")}
              </h3>
              <TitleRow
                item={data.last_watch}
                meta={formatWatchDate(data.last_watch.watched_at)}
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
                meta={`${show.count}`}
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
                <div key={g.genre} className="flex items-center gap-3">
                  <span className="text-xs text-foreground-secondary w-28 truncate shrink-0">
                    {g.genre}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${maxGenre > 0 ? (g.count / maxGenre) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {g.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.top_providers.length > 0 && (
          <div className="bg-card rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold">
              {t("wrapped.topProviders")}
            </h3>
            <div className="space-y-2">
              {data.top_providers.map((p) => (
                <div key={p.provider_id} className="flex items-center gap-3">
                  <span className="text-xs text-foreground-secondary w-28 truncate shrink-0">
                    {p.name}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${maxProvider > 0 ? (p.count / maxProvider) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {p.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(data.longest_binge || data.most_rewatched) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.longest_binge && (
            <div className="bg-card rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">
                {t("wrapped.longestBinge")}
              </h3>
              <TitleRow
                item={data.longest_binge}
                meta={t("wrapped.bingeMeta", {
                  days: data.longest_binge.days,
                  episodes: data.longest_binge.episodes,
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
                meta={t("wrapped.plays", { count: data.most_rewatched.plays })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
