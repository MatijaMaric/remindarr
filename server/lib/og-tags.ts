import type { YearInReview } from "../db/repository/year-in-review";

export function escapeOg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOgTags(opts: {
  title: string;
  description: string;
  image?: string | null;
}): string {
  const title = escapeOg(opts.title);
  const description = escapeOg(opts.description);
  const image = opts.image ? escapeOg(opts.image) : null;
  const imageTag = image
    ? `<meta property="og:image" content="${image}" />`
    : "";
  return `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    ${imageTag}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ""}`;
}

export function wrappedOgDescription(review: YearInReview): string {
  const hours = Math.round(review.watch_time_minutes / 60);
  const parts = [
    `${hours}h watched`,
    `${review.movies_watched} movie${review.movies_watched !== 1 ? "s" : ""}`,
    `${review.episodes_watched} episode${review.episodes_watched !== 1 ? "s" : ""}`,
  ];
  if (review.top_shows[0]) {
    parts.push(`Top show: ${review.top_shows[0].title}`);
  }
  return parts.join(" · ");
}

export function wrappedOgImage(review: YearInReview): string | null {
  const poster =
    review.top_shows[0]?.poster_url ?? review.first_watch?.poster_url ?? null;
  if (!poster) return null;
  if (poster.startsWith("http")) return poster;
  return `https://image.tmdb.org/t/p/w342${poster}`;
}
