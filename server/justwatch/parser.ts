import type { JWTitle, JWOffer, JWProvider } from "./types";
import { CONFIG } from "../config";

export interface ParsedTitle {
  id: string;
  objectType: "MOVIE" | "SHOW";
  title: string;
  releaseYear: number | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  shortDescription: string | null;
  genres: string[];
  imdbId: string | null;
  tmdbId: string | null;
  posterUrl: string | null;
  ageCertification: string | null;
  jwUrl: string | null;
  offers: ParsedOffer[];
  scores: ParsedScores;
}

export interface ParsedOffer {
  titleId: string;
  providerId: number;
  providerName: string;
  providerTechnicalName: string;
  providerIconUrl: string;
  monetizationType: string;
  presentationType: string;
  priceValue: number | null;
  priceCurrency: string | null;
  url: string;
  availableTo: string | null;
}

export interface ParsedScores {
  imdbScore: number | null;
  imdbVotes: number | null;
  tmdbScore: number | null;
  jwRating: number | null;
}

function formatPosterUrl(posterUrl: string | null): string | null {
  if (!posterUrl) return null;
  // posterUrl is like /poster/12345/{profile} — replace {profile} with a size
  return `${CONFIG.POSTER_BASE_URL}${posterUrl.replace("/poster", "").replace("{profile}", "s332")}`;
}

function formatIconUrl(icon: string): string {
  return `${CONFIG.ICON_BASE_URL}${icon.replace("/icon", "").replace("{profile}", "s100")}`;
}

function parseScores(scoring: JWTitle["content"]["scoring"] | undefined): ParsedScores {
  if (!scoring) return { imdbScore: null, imdbVotes: null, tmdbScore: null, jwRating: null };
  return {
    imdbScore: scoring.imdbScore ?? null,
    imdbVotes: scoring.imdbVotes ?? null,
    tmdbScore: scoring.tmdbScore ?? null,
    jwRating: scoring.jwRating ?? null,
  };
}

export function parseTitle(node: JWTitle): ParsedTitle {
  const content = node.content;
  const offers: ParsedOffer[] = (node.offers || []).map((o) => ({
    titleId: node.id,
    providerId: o.package.packageId,
    providerName: o.package.clearName,
    providerTechnicalName: o.package.technicalName,
    providerIconUrl: formatIconUrl(o.package.icon),
    monetizationType: o.monetizationType,
    presentationType: o.presentationType,
    priceValue: o.retailPriceValue,
    priceCurrency: o.currency,
    url: o.standardWebURL,
    availableTo: o.availableTo,
  }));

  return {
    id: node.id,
    objectType: node.objectType,
    title: content.title,
    releaseYear: content.originalReleaseYear,
    releaseDate: content.originalReleaseDate,
    runtimeMinutes: content.runtime,
    shortDescription: content.shortDescription,
    genres: content.genres?.map((g) => g.translation) || [],
    imdbId: content.externalIds?.imdbId || null,
    tmdbId: content.externalIds?.tmdbId || null,
    posterUrl: formatPosterUrl(content.posterUrl),
    ageCertification: content.ageCertification,
    jwUrl: content.fullPath ? `https://www.justwatch.com${content.fullPath}` : null,
    offers,
    scores: parseScores(content.scoring),
  };
}

export function parseTitles(edges: { node: JWTitle }[]): ParsedTitle[] {
  return edges.map((e) => parseTitle(e.node));
}

export function extractProviders(titles: ParsedTitle[]): JWProvider[] {
  const seen = new Map<number, JWProvider>();
  for (const t of titles) {
    for (const o of t.offers) {
      if (!seen.has(o.providerId)) {
        seen.set(o.providerId, {
          id: o.providerId,
          name: o.providerName,
          technicalName: o.providerTechnicalName,
          iconUrl: o.providerIconUrl,
        });
      }
    }
  }
  return Array.from(seen.values());
}
