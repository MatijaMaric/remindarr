/**
 * Builds a Plex deep link for a specific media item.
 *
 * The base URL uses app.plex.tv/#!/... so desktop browsers open the Plex web
 * app. When a watch.plex.tv slug is available, it is embedded as extra query
 * params so the frontend can construct a watch.plex.tv Android deep link
 * without an additional API call. app.plex.tv ignores these extra params.
 */
export function buildPlexDeepLink(
  serverId: string,
  ratingKey: string,
  slug?: string | null,
  mediaType?: string | null
): string {
  let url = `https://app.plex.tv/#!/server/${serverId}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`;
  if (slug && mediaType) {
    url += `&watchSlug=${encodeURIComponent(slug)}&mediaType=${encodeURIComponent(mediaType)}`;
  }
  return url;
}
