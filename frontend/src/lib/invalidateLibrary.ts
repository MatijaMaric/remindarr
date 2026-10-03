import type { QueryClient } from "@tanstack/react-query";

// These views derive tracking, watching, ratings or suggestions from the library.
const libraryKeys = new Set([
  "tracked",
  "home",
  "title-detail",
  "season-detail",
  "episode-detail",
  "season-status",
  "watch-history",
  "stats",
  "year-in-review",
  "activity",
  "calendar",
  "suggestions",
  "recommendations",
  "notification-count",
  "user-profile",
  "reels",
  "titles",
  "browse",
  "search",
  "up-next",
  "rating",
  "episode-rating",
  "season-ratings",
  "show-episode-ratings",
]);

export function invalidateLibrary(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) => libraryKeys.has(String(query.queryKey[0])),
  });
}
