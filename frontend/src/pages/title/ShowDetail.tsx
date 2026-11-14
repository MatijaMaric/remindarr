import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  SeasonSummary,
  ShowDetailsResponse,
  WatchProviderCountry,
} from "../../types";
import BackdateWatchedButton from "../../components/BackdateWatchedButton";
import Cast from "../../components/title-detail/Cast";
import ExternalLinks from "../../components/ExternalLinks";
import PersonCard from "../../components/PersonCard";
import ProvidersSection from "../../components/title-detail/ProvidersSection";
import RatingsSection from "../../components/title-detail/RatingsSection";
import RatingSparkline from "../../components/RatingSparkline";
import ShowHero from "../../components/title-detail/ShowHero";
import { Section } from "../../components/title-detail/Section";
import { posterUrl as mkPosterUrl } from "../../lib/tmdb-images";
import { formatDate, isToday } from "../../components/title-detail/utils";
import SectionErrorBoundary from "../../components/SectionErrorBoundary";
import SuggestionsRow from "../../components/title-detail/SuggestionsRow";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import ContentAdvisoryBanner from "../../components/ContentAdvisoryBanner";

export default function ShowDetail({ data }: { data: ShowDetailsResponse }) {
  const { title, tmdb, country } = data;
  const { user } = useAuth();
  const { t } = useTranslation();
  const overview = tmdb?.overview || title.short_description;

  const { data: pacingData } = useQuery({
    queryKey: ["show-episode-ratings", title.id],
    queryFn: ({ signal }) => api.getShowEpisodeRatings(title.id, signal),
    enabled: !!user,
  });

  const watchProviders = tmdb?.["watch/providers"]?.results?.[country] as
    | WatchProviderCountry
    | undefined;

  const creators = tmdb?.created_by || [];
  const cast = tmdb?.credits?.cast?.slice(0, 20) || [];

  // Filter out specials (season 0) and sort
  const seasons = (tmdb?.seasons || [])
    .filter((s: SeasonSummary) => s.season_number > 0)
    .sort(
      (a: SeasonSummary, b: SeasonSummary) => a.season_number - b.season_number,
    );

  return (
    <div className="space-y-8 pb-12 overflow-x-hidden">
      <ContentAdvisoryBanner
        titleId={title.id}
        certification={title.age_certification}
      />
      {/* Hero */}
      <ShowHero title={title} tmdb={tmdb} country={country} />

      {/* Metadata strip — mobile only; desktop ShowHero already renders these fields inline */}
      <div className="sm:hidden bg-card -mx-4 px-6 py-5 flex flex-wrap gap-x-8 gap-y-3 border-b border-border">
        {[
          { label: "TYPE", value: "TV Show" },
          tmdb?.status ? { label: "STATUS", value: tmdb.status } : null,
          tmdb?.number_of_seasons != null
            ? { label: "SEASONS", value: String(tmdb.number_of_seasons) }
            : null,
          tmdb?.number_of_episodes != null
            ? { label: "EPISODES", value: String(tmdb.number_of_episodes) }
            : null,
          title.next_episode_air_date
            ? {
                label: "NEXT EP",
                value: formatDate(title.next_episode_air_date),
              }
            : null,
          title.offers[0]?.provider_name
            ? { label: "NETWORK", value: title.offers[0].provider_name }
            : null,
          tmdb?.episode_run_time?.[0]
            ? { label: "AVG RUNTIME", value: `${tmdb.episode_run_time[0]} min` }
            : null,
          title.imdb_score
            ? { label: "IMDB", value: `★ ${title.imdb_score.toFixed(1)}` }
            : null,
        ]
          .filter(Boolean)
          .map((cell) => (
            <div key={cell!.label}>
              <div className="text-xs text-muted-foreground mb-1">
                {cell!.label}
              </div>
              <div className="font-mono text-[13px] font-semibold text-foreground">
                {cell!.value}
              </div>
            </div>
          ))}
      </div>

      {/* Overview */}
      {overview && (
        <Section title="Overview">
          <p className="text-foreground-secondary leading-relaxed select-text">
            {overview}
          </p>
        </Section>
      )}

      {/* Rating & Social */}
      <SectionErrorBoundary label="ratings">
        <RatingsSection
          titleId={title.id}
          shareTitle={tmdb?.name || title.title}
        />
      </SectionErrorBoundary>

      {/* Creators & Cast */}
      {creators.length > 0 && (
        <SectionErrorBoundary label="creators">
          <Section title="Created By">
            <div className="flex gap-4">
              {creators.map((c) => (
                <PersonCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  role="Creator"
                  profilePath={c.profile_path}
                />
              ))}
            </div>
          </Section>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary label="cast">
        <Cast cast={cast} />
      </SectionErrorBoundary>

      <RatingSparkline
        points={pacingData?.user_ratings ?? []}
        heading={t("pacing.label", "Pacing")}
        label={t("pacing.aria", "Episode rating pacing")}
      />

      {/* Seasons */}
      {seasons.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight leading-tight">
              Seasons
            </h2>
            <BackdateWatchedButton
              scope="title"
              titleId={title.id}
              variant="ghost"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {seasons.map((s: SeasonSummary) => {
              const airingToday = isToday(s.air_date);
              return (
                <Link
                  key={s.season_number}
                  to={`/title/${title.id}/season/${s.season_number}`}
                  className={`rounded-lg overflow-hidden border transition-colors group ${
                    airingToday
                      ? "bg-primary-soft border-primary-border hover:border-primary-border"
                      : "bg-card border-border hover:border-primary-border"
                  }`}
                >
                  <div className="aspect-[2/3] bg-muted">
                    {s.poster_path ? (
                      <img
                        src={mkPosterUrl(s.poster_path, "w342") ?? ""}
                        alt={s.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        width={342}
                        height={513}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        Season {s.season_number}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-medium text-foreground group-hover:text-primary-text transition-colors truncate">
                        {s.name}
                      </h3>
                      {airingToday && (
                        <span className="text-[11px] text-primary-text tracking-[0.12em] shrink-0">
                          AIRING NOW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.episode_count} episode
                      {s.episode_count !== 1 ? "s" : ""}
                      {s.air_date && ` · ${s.air_date.slice(0, 4)}`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Streaming Availability */}
      <SectionErrorBoundary label="streaming providers">
        <ProvidersSection
          country={country}
          offers={title.offers}
          watchProviders={watchProviders}
          watchLink={watchProviders?.link}
          owned={
            user
              ? { titleId: title.id, formats: title.owned_formats ?? [] }
              : undefined
          }
        />
      </SectionErrorBoundary>

      {/* Suggestions */}
      <SuggestionsRow titleId={title.id} type="show" />

      {/* External Links */}
      {tmdb && (
        <Section title="Links">
          <ExternalLinks
            externalIds={tmdb.external_ids}
            tmdbId={tmdb.id}
            type="tv"
          />
        </Section>
      )}

      {/* Additional Info */}
      {tmdb && (
        <Section title="Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {tmdb.type && (
              <div>
                <span className="text-muted-foreground block">Type</span>
                <span className="text-foreground-secondary">{tmdb.type}</span>
              </div>
            )}
            {tmdb.original_language && (
              <div>
                <span className="text-muted-foreground block">
                  Original Language
                </span>
                <span className="text-foreground-secondary">
                  {tmdb.original_language.toUpperCase()}
                </span>
              </div>
            )}
            {tmdb.production_countries?.length > 0 && (
              <div>
                <span className="text-muted-foreground block">Country</span>
                <span className="text-foreground-secondary">
                  {tmdb.production_countries.map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.spoken_languages?.length > 0 && (
              <div>
                <span className="text-muted-foreground block">Languages</span>
                <span className="text-foreground-secondary">
                  {tmdb.spoken_languages.map((l) => l.english_name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.production_companies?.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-muted-foreground block">Production</span>
                <span className="text-foreground-secondary">
                  {tmdb.production_companies.map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
