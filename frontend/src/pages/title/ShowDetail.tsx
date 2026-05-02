import { Link } from "react-router";
import type { SeasonSummary, ShowDetailsResponse, WatchProviderCountry } from "../../types";
import BackdateWatchedButton from "../../components/BackdateWatchedButton";
import Cast from "../../components/title-detail/Cast";
import ExternalLinks from "../../components/ExternalLinks";
import PersonCard from "../../components/PersonCard";
import ProvidersSection from "../../components/title-detail/ProvidersSection";
import RatingsSection from "../../components/title-detail/RatingsSection";
import ShowHero from "../../components/title-detail/ShowHero";
import { Section } from "../../components/title-detail/Section";
import { posterUrl as mkPosterUrl } from "../../lib/tmdb-images";
import { formatDate, isToday } from "../../components/title-detail/utils";
import SectionErrorBoundary from "../../components/SectionErrorBoundary";

export default function ShowDetail({ data }: { data: ShowDetailsResponse }) {
  const { title, tmdb, country } = data;
  const overview = tmdb?.overview || title.short_description;

  const watchProviders = tmdb?.["watch/providers"]?.results?.[country] as WatchProviderCountry | undefined;

  const creators = tmdb?.created_by || [];
  const cast = tmdb?.credits?.cast?.slice(0, 20) || [];

  // Filter out specials (season 0) and sort
  const seasons = (tmdb?.seasons || [])
    .filter((s: SeasonSummary) => s.season_number > 0)
    .sort((a: SeasonSummary, b: SeasonSummary) => a.season_number - b.season_number);

  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <ShowHero title={title} tmdb={tmdb} country={country} />

      {/* Metadata strip */}
      <div className="dark-section -mx-4 px-6 sm:px-12 py-5 flex flex-wrap gap-x-10 gap-y-3 border-b border-white/[0.06]">
        {[
          { label: "TYPE", value: "TV Show" },
          tmdb?.status ? { label: "STATUS", value: tmdb.status } : null,
          tmdb?.number_of_seasons != null ? { label: "SEASONS", value: String(tmdb.number_of_seasons) } : null,
          tmdb?.number_of_episodes != null ? { label: "EPISODES", value: String(tmdb.number_of_episodes) } : null,
          title.next_episode_air_date ? { label: "NEXT EP", value: formatDate(title.next_episode_air_date) } : null,
          title.offers[0]?.provider_name ? { label: "NETWORK", value: title.offers[0].provider_name } : null,
          tmdb?.episode_run_time?.[0] ? { label: "AVG RUNTIME", value: `${tmdb.episode_run_time[0]} min` } : null,
          title.imdb_score ? { label: "IMDB", value: `★ ${title.imdb_score.toFixed(1)}` } : null,
        ]
          .filter(Boolean)
          .map((cell) => (
            <div key={cell!.label}>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">
                {cell!.label}
              </div>
              <div className="font-mono text-[13px] font-semibold text-zinc-100">{cell!.value}</div>
            </div>
          ))}
      </div>

      {/* Overview */}
      {overview && (
        <Section title="Overview">
          <p className="text-zinc-300 leading-relaxed select-text">{overview}</p>
        </Section>
      )}

      {/* Rating & Social */}
      <SectionErrorBoundary label="ratings">
        <RatingsSection titleId={title.id} shareTitle={tmdb?.name || title.title} />
      </SectionErrorBoundary>

      {/* Creators & Cast */}
      {creators.length > 0 && (
        <SectionErrorBoundary label="creators">
          <Section title="Created By">
            <div className="flex gap-4">
              {creators.map((c) => (
                <PersonCard key={c.id} id={c.id} name={c.name} role="Creator" profilePath={c.profile_path} />
              ))}
            </div>
          </Section>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary label="cast">
        <Cast cast={cast} />
      </SectionErrorBoundary>

      {/* Seasons */}
      {seasons.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] font-semibold text-white tracking-tight leading-tight">Seasons</h2>
            <BackdateWatchedButton scope="title" titleId={title.id} variant="ghost" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {seasons.map((s: SeasonSummary) => {
              const airingToday = isToday(s.air_date);
              return (
                <Link
                  key={s.season_number}
                  to={`/title/${title.id}/season/${s.season_number}`}
                  className={`rounded-xl overflow-hidden border transition-colors group ${
                    airingToday
                      ? "bg-amber-400/[0.06] border-amber-400/25 hover:border-amber-400/50"
                      : "bg-zinc-900 border-white/[0.06] hover:border-amber-500/50"
                  }`}
                >
                  <div className="aspect-[2/3] bg-zinc-800">
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
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
                        Season {s.season_number}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-medium text-white group-hover:text-amber-400 transition-colors truncate">
                        {s.name}
                      </h3>
                      {airingToday && (
                        <span className="font-mono text-[10px] text-amber-400 tracking-[0.12em] uppercase shrink-0">
                          AIRING NOW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {s.episode_count} episode{s.episode_count !== 1 ? "s" : ""}
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
        <ProvidersSection offers={title.offers} watchProviders={watchProviders} watchLink={watchProviders?.link} />
      </SectionErrorBoundary>

      {/* External Links */}
      {tmdb && (
        <Section title="Links">
          <ExternalLinks externalIds={tmdb.external_ids} tmdbId={tmdb.id} type="tv" />
        </Section>
      )}

      {/* Additional Info */}
      {tmdb && (
        <Section title="Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {tmdb.type && (
              <div>
                <span className="text-zinc-500 block">Type</span>
                <span className="text-zinc-300">{tmdb.type}</span>
              </div>
            )}
            {tmdb.original_language && (
              <div>
                <span className="text-zinc-500 block">Original Language</span>
                <span className="text-zinc-300">{tmdb.original_language.toUpperCase()}</span>
              </div>
            )}
            {tmdb.production_countries?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Country</span>
                <span className="text-zinc-300">
                  {tmdb.production_countries.map((c) => c.name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.spoken_languages?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Languages</span>
                <span className="text-zinc-300">
                  {tmdb.spoken_languages.map((l) => l.english_name).join(", ")}
                </span>
              </div>
            )}
            {tmdb.production_companies?.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-zinc-500 block">Production</span>
                <span className="text-zinc-300">
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
