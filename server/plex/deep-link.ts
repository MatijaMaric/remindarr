/**
 * Builds a Plex deep link for a specific media item.
 * Uses app.plex.tv/#!/... (without /desktop) so the URL works cross-platform:
 * web browsers load the Plex web app, and on mobile it can trigger universal
 * links to open the native Plex app if installed.
 */
export function buildPlexDeepLink(serverId: string, ratingKey: string): string {
  return `https://app.plex.tv/#!/server/${serverId}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`;
}
