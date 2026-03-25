import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import * as api from "../api";
import type {
  Title,
  MovieDetailsResponse,
  ShowDetailsResponse,
  CastMember,
  CrewMember,
  WatchProviderCountry,
  ReleaseDatesResult,
  SeasonSummary,
} from "../types";
import TrackButton from "../components/TrackButton";
import { WatchedIcon } from "../components/EpisodeComponents";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import ExternalLinks from "../components/ExternalLinks";

const TMDB_IMG = "https://image.tmdb.org/t/p";

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "Premiere",
  2: "Theatrical (Limited)",
  3: "Theatrical",
  4: "Digital",
  5: "Physical",
  6: "TV",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatCurrency(value: number): string {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RatingBadge({ label, score, max = 10 }: { label: string; score: number | null; max?: number }) {
  if (score === null || score === undefined) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
      <span className="text-xl font-bold text-white">
        {score.toFixed(1)}<span className="text-sm text-zinc-500">/{max}</span>
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

const NETWORK_DISPLAY_LIMIT = 5;
const PROVIDER_DISPLAY_LIMIT = 8;

function NetworkList({ networks }: { networks: { id: number; name: string; logo_path: string | null }[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = networks.length > NETWORK_DISPLAY_LIMIT;
  const visible = expanded ? networks : networks.slice(0, NETWORK_DISPLAY_LIMIT);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {visible.map(n => (
        <div key={n.id} className="flex items-center gap-1.5">
          {n.logo_path && (
            <img src={`${TMDB_IMG}/w92${n.logo_path}`} alt={n.name} className="h-5 object-contain brightness-0 invert opacity-70" />
          )}
          <span className="text-sm text-zinc-400">{n.name}</span>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          {expanded ? "Show less" : `+${networks.length - NETWORK_DISPLAY_LIMIT} more`}
        </button>
      )}
    </div>
  );
}

function ProviderRow({ label, providers }: { label: string; providers: { logo_path: string; provider_name: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!providers?.length) return null;
  const hasMore = providers.length > PROVIDER_DISPLAY_LIMIT;
  const visible = expanded ? providers : providers.slice(0, PROVIDER_DISPLAY_LIMIT);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-400 w-20 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2 items-center">
        {visible.map((p) => (
          <div key={p.provider_name} className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1">
            <img src={`${TMDB_IMG}/w45${p.logo_path}`} alt={p.provider_name} className="w-6 h-6 rounded" />
            <span className="text-sm text-zinc-300">{p.provider_name}</span>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors px-2 py-1"
          >
            {expanded ? "Show less" : `+${providers.length - PROVIDER_DISPLAY_LIMIT} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movieData, setMovieData] = useState<MovieDetailsResponse | null>(null);
  const [showData, setShowData] = useState<ShowDetailsResponse | null>(null);

  // First we need to know the object_type, so we fetch as movie first;
  // if 404 or wrong type, we try show
  useEffect(() => {
    if (!id) return;
    const titleId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Try movie first
        try {
          const data = await api.getMovieDetails(titleId);
          if (!cancelled) {
            if (data.title.object_type === "SHOW") {
              // It's actually a show, fetch show details
              const showResp = await api.getShowDetails(titleId);
              if (!cancelled) setShowData(showResp);
            } else {
              setMovieData(data);
            }
          }
        } catch {
          // Try show if movie fails
          const data = await api.getShowDetails(titleId);
          if (!cancelled) setShowData(data);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (movieData) return <MovieDetail data={movieData} />;
  if (showData) return <ShowDetail data={showData} />;

  return <div className="text-zinc-400 text-center py-20">Title not found</div>;
}

// ─── Movie Detail ────────────────────────────────────────────────────────────

function MovieDetail({ data }: { data: MovieDetailsResponse }) {
  const { title, tmdb, country } = data;
  const [watched, setWatched] = useState(title.is_watched ?? false);

  async function toggleWatched() {
    const prev = watched;
    setWatched(!prev);
    try {
      if (prev) {
        await api.unwatchMovie(title.id);
      } else {
        await api.watchMovie(title.id);
      }
    } catch {
      setWatched(prev);
    }
  }
  const overview = tmdb?.overview || title.short_description;
  const genres = tmdb?.genres?.map(g => g.name) || title.genres;
  const certification = title.age_certification;
  const backdropUrl = tmdb?.backdrop_path ? `${TMDB_IMG}/w1280${tmdb.backdrop_path}` : null;
  const posterUrl = tmdb?.poster_path ? `${TMDB_IMG}/w500${tmdb.poster_path}` : title.poster_url;

  // Release dates for the user's country
  const countryReleaseDates = tmdb?.release_dates?.results?.find(
    (r: ReleaseDatesResult) => r.iso_3166_1 === country
  );
  // Also check US as fallback
  const usReleaseDates = tmdb?.release_dates?.results?.find(
    (r: ReleaseDatesResult) => r.iso_3166_1 === "US"
  );
  const releaseDates = countryReleaseDates || usReleaseDates;

  // Watch providers for the user's country
  const watchProviders = tmdb?.["watch/providers"]?.results?.[country] as WatchProviderCountry | undefined;

  // Key crew
  const directors = tmdb?.credits?.crew?.filter((c: CrewMember) => c.job === "Director") || [];
  const writers = tmdb?.credits?.crew?.filter((c: CrewMember) => c.department === "Writing").slice(0, 5) || [];
  const cast = tmdb?.credits?.cast?.slice(0, 20) || [];

  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <div className="relative -mx-4 -mt-6 px-4 pt-6 pb-8" style={backdropUrl ? {
        backgroundImage: `linear-gradient(to bottom, rgba(3,7,18,0.6), rgba(3,7,18,1)), url(${backdropUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      } : undefined}>
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Poster */}
          <div className="w-48 shrink-0 mx-auto sm:mx-0">
            {posterUrl ? (
              <img src={posterUrl} alt={title.title} className="w-full rounded-xl shadow-2xl" />
            ) : (
              <div className="aspect-[2/3] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600">No poster</div>
            )}
          </div>

          {/* Title info */}
          <div className="flex-1 space-y-3">
            <div>
              {tmdb?.tagline && (
                <p className="text-sm text-amber-400 italic mb-1">{tmdb.tagline}</p>
              )}
              <h1 className="text-3xl font-bold text-white">{tmdb?.title || title.title}</h1>
              {(() => {
                const displayTitle = tmdb?.title || title.title;
                const originalTitle = tmdb?.original_title || title.original_title;
                return originalTitle && originalTitle !== displayTitle ? (
                  <p className="text-sm text-zinc-400 mt-1">{originalTitle}</p>
                ) : null;
              })()}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              {title.release_year && <span>{title.release_year}</span>}
              {(title.runtime_minutes || tmdb?.runtime) && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{formatRuntime(tmdb?.runtime || title.runtime_minutes)}</span>
                </>
              )}
              {certification && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="border border-white/[0.10] px-1.5 py-0.5 rounded text-xs">{certification}</span>
                </>
              )}
              {tmdb?.status && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{tmdb.status}</span>
                </>
              )}
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span key={g} className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full text-xs">{g}</span>
                ))}
              </div>
            )}

            {/* Ratings */}
            <div className="flex items-center gap-6 pt-2">
              <RatingBadge label="IMDb" score={title.imdb_score} />
              <RatingBadge label="TMDB" score={tmdb?.vote_average ?? title.tmdb_score} />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <TrackButton titleId={title.id} isTracked={title.is_tracked} titleData={title} />
              <WatchedIcon watched={watched} onClick={toggleWatched} />
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <Section title="Overview">
          <p className="text-zinc-300 leading-relaxed">{overview}</p>
        </Section>
      )}

      {/* Cast & Crew */}
      {(directors.length > 0 || writers.length > 0) && (
        <Section title="Crew">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {directors.length > 0 && (
              <div>
                <span className="text-zinc-400">Director: </span>
                <span className="text-white">{directors.map(d => d.name).join(", ")}</span>
              </div>
            )}
            {writers.length > 0 && (
              <div>
                <span className="text-zinc-400">Writers: </span>
                <span className="text-white">{writers.map(w => w.name).join(", ")}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {cast.length > 0 && (
        <Section title="Cast">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {cast.map((c: CastMember) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </div>
        </Section>
      )}

      {/* Release Dates */}
      {releaseDates && releaseDates.release_dates.length > 0 && (
        <Section title={`Release Dates (${releaseDates.iso_3166_1})`}>
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 px-4 text-zinc-400 font-medium">Type</th>
                  <th className="text-left py-2 px-4 text-zinc-400 font-medium">Date</th>
                  <th className="text-left py-2 px-4 text-zinc-400 font-medium">Certification</th>
                  <th className="text-left py-2 px-4 text-zinc-400 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {releaseDates.release_dates.map((rd) => (
                  <tr key={`${rd.release_date}-${rd.type}`} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 px-4 text-zinc-300">{RELEASE_TYPE_LABELS[rd.type] || `Type ${rd.type}`}</td>
                    <td className="py-2 px-4 text-zinc-300">{formatDate(rd.release_date)}</td>
                    <td className="py-2 px-4">
                      {rd.certification && (
                        <span className="border border-white/[0.10] px-1.5 py-0.5 rounded text-xs text-zinc-300">{rd.certification}</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-zinc-500 text-xs">{rd.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Streaming Availability */}
      {watchProviders && (
        <Section title="Where to Watch">
          <div className="space-y-3">
            <ProviderRow label="Stream" providers={watchProviders.flatrate || []} />
            <ProviderRow label="Free" providers={watchProviders.free || []} />
            <ProviderRow label="Ads" providers={watchProviders.ads || []} />
            <ProviderRow label="Rent" providers={watchProviders.rent || []} />
            <ProviderRow label="Buy" providers={watchProviders.buy || []} />
          </div>
          {/* Also show existing offers */}
          {title.offers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-zinc-500 mb-2">Direct links</p>
              <div className="flex flex-wrap gap-2">
                {dedupeOffers(title.offers).map((offer) => (
                  <a
                    key={offer.id}
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1 hover:bg-zinc-700 transition-colors"
                    title={`${offer.provider_name} (${offer.monetization_type})`}
                  >
                    <img src={offer.provider_icon_url} alt={offer.provider_name} className="w-6 h-6 rounded" loading="lazy" />
                    <span className="text-sm text-zinc-300">{offer.provider_name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* If no TMDB watch providers, still show JW offers */}
      {!watchProviders && title.offers.length > 0 && (
        <Section title="Where to Watch">
          <div className="flex flex-wrap gap-2">
            {dedupeOffers(title.offers).map((offer) => (
              <a
                key={offer.id}
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1 hover:bg-zinc-700 transition-colors"
                title={`${offer.provider_name} (${offer.monetization_type})`}
              >
                <img src={offer.provider_icon_url} alt={offer.provider_name} className="w-6 h-6 rounded" loading="lazy" />
                <span className="text-sm text-zinc-300">{offer.provider_name}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* External Links */}
      {tmdb && (
        <Section title="Links">
          <ExternalLinks
            externalIds={tmdb.external_ids ?? { imdb_id: tmdb.imdb_id }}
            tmdbId={tmdb.id}
            type="movie"
          />
        </Section>
      )}

      {/* Additional Info */}
      {tmdb && (
        <Section title="Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {tmdb.original_language && (
              <div>
                <span className="text-zinc-500 block">Original Language</span>
                <span className="text-zinc-300">{tmdb.original_language.toUpperCase()}</span>
              </div>
            )}
            {tmdb.production_countries?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Country</span>
                <span className="text-zinc-300">{tmdb.production_countries.map(c => c.name).join(", ")}</span>
              </div>
            )}
            {tmdb.spoken_languages?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Languages</span>
                <span className="text-zinc-300">{tmdb.spoken_languages.map(l => l.english_name).join(", ")}</span>
              </div>
            )}
            {tmdb.budget > 0 && (
              <div>
                <span className="text-zinc-500 block">Budget</span>
                <span className="text-zinc-300">{formatCurrency(tmdb.budget)}</span>
              </div>
            )}
            {tmdb.revenue > 0 && (
              <div>
                <span className="text-zinc-500 block">Revenue</span>
                <span className="text-zinc-300">{formatCurrency(tmdb.revenue)}</span>
              </div>
            )}
            {tmdb.production_companies?.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-zinc-500 block">Production</span>
                <span className="text-zinc-300">{tmdb.production_companies.map(c => c.name).join(", ")}</span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Show Detail ─────────────────────────────────────────────────────────────

function ShowDetail({ data }: { data: ShowDetailsResponse }) {
  const { title, tmdb, country } = data;
  const overview = tmdb?.overview || title.short_description;
  const genres = tmdb?.genres?.map(g => g.name) || title.genres;
  const certification = getCertification(tmdb?.content_ratings?.results, country) || title.age_certification;
  const backdropUrl = tmdb?.backdrop_path ? `${TMDB_IMG}/w1280${tmdb.backdrop_path}` : null;
  const posterUrl = tmdb?.poster_path ? `${TMDB_IMG}/w500${tmdb.poster_path}` : title.poster_url;

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
      <div className="relative -mx-4 -mt-6 px-4 pt-6 pb-8" style={backdropUrl ? {
        backgroundImage: `linear-gradient(to bottom, rgba(3,7,18,0.6), rgba(3,7,18,1)), url(${backdropUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      } : undefined}>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="w-48 shrink-0 mx-auto sm:mx-0">
            {posterUrl ? (
              <img src={posterUrl} alt={title.title} className="w-full rounded-xl shadow-2xl" />
            ) : (
              <div className="aspect-[2/3] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600">No poster</div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              {tmdb?.tagline && (
                <p className="text-sm text-amber-400 italic mb-1">{tmdb.tagline}</p>
              )}
              <h1 className="text-3xl font-bold text-white">{tmdb?.name || title.title}</h1>
              {(() => {
                const displayTitle = tmdb?.name || title.title;
                const originalTitle = tmdb?.original_name || title.original_title;
                return originalTitle && originalTitle !== displayTitle ? (
                  <p className="text-sm text-zinc-400 mt-1">{originalTitle}</p>
                ) : null;
              })()}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">TV</span>
              {tmdb?.first_air_date && <span>{tmdb.first_air_date.slice(0, 4)}</span>}
              {tmdb?.last_air_date && tmdb.first_air_date?.slice(0, 4) !== tmdb.last_air_date.slice(0, 4) && (
                <span>– {tmdb.last_air_date.slice(0, 4)}</span>
              )}
              {tmdb?.episode_run_time?.[0] && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{tmdb.episode_run_time[0]}m/ep</span>
                </>
              )}
              {certification && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="border border-white/[0.10] px-1.5 py-0.5 rounded text-xs">{certification}</span>
                </>
              )}
              {tmdb?.status && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{tmdb.status}</span>
                </>
              )}
              {tmdb && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{tmdb.number_of_seasons} season{tmdb.number_of_seasons !== 1 ? "s" : ""}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{tmdb.number_of_episodes} episodes</span>
                </>
              )}
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span key={g} className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full text-xs">{g}</span>
                ))}
              </div>
            )}

            {/* Networks */}
            {tmdb?.networks && tmdb.networks.length > 0 && (
              <NetworkList networks={tmdb.networks} />
            )}

            <div className="flex items-center gap-6 pt-2">
              <RatingBadge label="IMDb" score={title.imdb_score} />
              <RatingBadge label="TMDB" score={tmdb?.vote_average ?? title.tmdb_score} />
            </div>

            <div className="pt-2">
              <TrackButton titleId={title.id} isTracked={title.is_tracked} titleData={title} />
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <Section title="Overview">
          <p className="text-zinc-300 leading-relaxed">{overview}</p>
        </Section>
      )}

      {/* Creators & Cast */}
      {creators.length > 0 && (
        <Section title="Created By">
          <div className="flex gap-4">
            {creators.map((c) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role="Creator" profilePath={c.profile_path} />
            ))}
          </div>
        </Section>
      )}

      {cast.length > 0 && (
        <Section title="Cast">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {cast.map((c: CastMember) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </div>
        </Section>
      )}

      {/* Seasons */}
      {seasons.length > 0 && (
        <Section title="Seasons">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {seasons.map((s: SeasonSummary) => (
              <Link
                key={s.season_number}
                to={`/title/${title.id}/season/${s.season_number}`}
                className="bg-zinc-900 rounded-xl overflow-hidden border border-white/[0.06] hover:border-amber-500/50 transition-colors group"
              >
                <div className="aspect-[2/3] bg-zinc-800">
                  {s.poster_path ? (
                    <img
                      src={`${TMDB_IMG}/w342${s.poster_path}`}
                      alt={s.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
                      Season {s.season_number}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium text-white group-hover:text-amber-400 transition-colors truncate">{s.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {s.episode_count} episode{s.episode_count !== 1 ? "s" : ""}
                    {s.air_date && ` · ${s.air_date.slice(0, 4)}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Streaming Availability */}
      {watchProviders && (
        <Section title="Where to Watch">
          <div className="space-y-3">
            <ProviderRow label="Stream" providers={watchProviders.flatrate || []} />
            <ProviderRow label="Free" providers={watchProviders.free || []} />
            <ProviderRow label="Ads" providers={watchProviders.ads || []} />
            <ProviderRow label="Rent" providers={watchProviders.rent || []} />
            <ProviderRow label="Buy" providers={watchProviders.buy || []} />
          </div>
          {title.offers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-zinc-500 mb-2">Direct links</p>
              <div className="flex flex-wrap gap-2">
                {dedupeOffers(title.offers).map((offer) => (
                  <a
                    key={offer.id}
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1 hover:bg-zinc-700 transition-colors"
                    title={`${offer.provider_name} (${offer.monetization_type})`}
                  >
                    <img src={offer.provider_icon_url} alt={offer.provider_name} className="w-6 h-6 rounded" loading="lazy" />
                    <span className="text-sm text-zinc-300">{offer.provider_name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {!watchProviders && title.offers.length > 0 && (
        <Section title="Where to Watch">
          <div className="flex flex-wrap gap-2">
            {dedupeOffers(title.offers).map((offer) => (
              <a
                key={offer.id}
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1 hover:bg-zinc-700 transition-colors"
                title={`${offer.provider_name} (${offer.monetization_type})`}
              >
                <img src={offer.provider_icon_url} alt={offer.provider_name} className="w-6 h-6 rounded" loading="lazy" />
                <span className="text-sm text-zinc-300">{offer.provider_name}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

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
                <span className="text-zinc-300">{tmdb.production_countries.map(c => c.name).join(", ")}</span>
              </div>
            )}
            {tmdb.spoken_languages?.length > 0 && (
              <div>
                <span className="text-zinc-500 block">Languages</span>
                <span className="text-zinc-300">{tmdb.spoken_languages.map(l => l.english_name).join(", ")}</span>
              </div>
            )}
            {tmdb.production_companies?.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-zinc-500 block">Production</span>
                <span className="text-zinc-300">{tmdb.production_companies.map(c => c.name).join(", ")}</span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function getCertification(results: { iso_3166_1: string; rating: string }[] | undefined, country: string): string | null {
  if (!results) return null;
  const match = results.find(r => r.iso_3166_1 === country) || results.find(r => r.iso_3166_1 === "US");
  return match?.rating || null;
}

function dedupeOffers(offers: Title["offers"]) {
  const map = new Map<number, Title["offers"][0]>();
  for (const o of offers) {
    if (!map.has(o.provider_id)) {
      map.set(o.provider_id, o);
    }
  }
  return Array.from(map.values());
}
