export type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";
export type BackdropSize = "w300" | "w780" | "w1280" | "original";
export type ProfileSize = "w45" | "w185" | "h632" | "original";
export type StillSize = "w92" | "w185" | "w300" | "original";
export type LogoSize = "w45" | "w92" | "w154" | "w185" | "w300" | "w500" | "original";

const BASE = "https://image.tmdb.org/t/p";

export function posterUrl(
  path: string | null | undefined,
  size: PosterSize = "w342",
): string | null {
  if (!path) return null;
  return `${BASE}/${size}${path}`;
}

export function backdropUrl(
  path: string | null | undefined,
  size: BackdropSize = "w1280",
): string | null {
  if (!path) return null;
  return `${BASE}/${size}${path}`;
}

export function profileUrl(
  path: string | null | undefined,
  size: ProfileSize = "w185",
): string | null {
  if (!path) return null;
  return `${BASE}/${size}${path}`;
}

export function stillUrl(
  path: string | null | undefined,
  size: StillSize = "w300",
): string | null {
  if (!path) return null;
  return `${BASE}/${size}${path}`;
}

export function logoUrl(
  path: string | null | undefined,
  size: LogoSize = "w185",
): string | null {
  if (!path) return null;
  return `${BASE}/${size}${path}`;
}
