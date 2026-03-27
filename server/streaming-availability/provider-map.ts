/**
 * Maps Streaming Availability service IDs to TMDB provider IDs.
 * Extend this map as new providers are encountered.
 */
export const SA_TO_TMDB_PROVIDER: Map<string, number> = new Map([
  ["netflix", 8],
  ["prime", 9],
  ["disney", 337],
  ["hbo", 384],
  ["apple", 350],
  ["paramount", 531],
  ["peacock", 386],
  ["hulu", 15],
  ["mubi", 11],
  ["curiosity", 190],
  ["stan", 21],
  ["now", 39],
  ["wow", 30],
  ["crave", 230],
  ["all4", 103],
  ["iplayer", 38],
  ["britbox", 380],
  ["hotstar", 122],
  ["zee5", 232],
  ["starz", 43],
  ["showtime", 37],
  ["crunchyroll", 283],
  ["tubi", 73],
  ["plutotv", 300],
]);

/**
 * Maps SA offer types to the monetization types used in our database.
 */
export function mapSAMonetizationType(saType: string): string {
  switch (saType) {
    case "subscription":
      return "FLATRATE";
    case "free":
      return "FREE";
    case "addon":
      return "ADS";
    case "rent":
      return "RENT";
    case "buy":
      return "BUY";
    default:
      return "FLATRATE";
  }
}
