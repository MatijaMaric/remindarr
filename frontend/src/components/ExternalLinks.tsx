import type { ExternalIds } from "../types";

interface ExternalLinksProps {
  externalIds?: ExternalIds | null;
  tmdbId: number;
  type: "movie" | "tv" | "person";
}

const TMDB_BASE = "https://www.themoviedb.org";

function buildLinks(
  externalIds: ExternalIds | null | undefined,
  tmdbId: number,
  type: "movie" | "tv" | "person",
) {
  const links: { label: string; url: string; icon: React.ReactNode }[] = [];

  links.push({
    label: "TMDB",
    url: `${TMDB_BASE}/${type}/${tmdbId}`,
    icon: <TmdbIcon />,
  });

  if (externalIds?.imdb_id) {
    const imdbPath = type === "person" ? "name" : "title";
    links.push({
      label: "IMDB",
      url: `https://www.imdb.com/${imdbPath}/${externalIds.imdb_id}`,
      icon: <ImdbIcon />,
    });
  }

  if (externalIds?.instagram_id) {
    links.push({
      label: "Instagram",
      url: `https://www.instagram.com/${externalIds.instagram_id}`,
      icon: <InstagramIcon />,
    });
  }

  if (externalIds?.twitter_id) {
    links.push({
      label: "X",
      url: `https://x.com/${externalIds.twitter_id}`,
      icon: <XIcon />,
    });
  }

  if (externalIds?.facebook_id) {
    links.push({
      label: "Facebook",
      url: `https://www.facebook.com/${externalIds.facebook_id}`,
      icon: <FacebookIcon />,
    });
  }

  return links;
}

export default function ExternalLinks({ externalIds, tmdbId, type }: ExternalLinksProps) {
  const links = buildLinks(externalIds, tmdbId, type);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.label}
          className="text-zinc-400 hover:text-white transition-colors"
          data-testid={`external-link-${link.label.toLowerCase()}`}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

function TmdbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm5 0h-2V8h2v8z" />
    </svg>
  );
}

function ImdbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M2 4v16h20V4H2zm3 12H4V8h1v8zm5.5 0H9.3l-.5-3.5-.5 3.5H7V8h1.2l.5 3.5L9.2 8h1.3v8zm4.5 0h-1.5V8H14c.8 0 1.4.2 1.8.6.4.4.7 1 .7 1.8v3.2c0 .8-.2 1.4-.7 1.8-.4.4-1 .6-1.8.6zm4 0h-1.5V8H19c1.1 0 2 .7 2 1.6v1.8c0 .9-.4 1.5-1 1.7l1.2 2.9h-1.6L18.5 13H18v3zm-4-6.8v5.6c.6 0 .8-.3.8-.8v-4c0-.5-.2-.8-.8-.8zm4 0v2.3h.5c.3 0 .5-.2.5-.5v-1.3c0-.3-.2-.5-.5-.5H18z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
