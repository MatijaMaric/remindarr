export interface ProviderColor {
  bg: string;
  hover: string;
  text: string;
}

const PROVIDER_COLORS: Record<number, ProviderColor> = {
  // Netflix
  8: { bg: "#E50914", hover: "#B20710", text: "#ffffff" },
  // Amazon Prime Video
  9: { bg: "#00A8E1", hover: "#0088B8", text: "#ffffff" },
  119: { bg: "#00A8E1", hover: "#0088B8", text: "#ffffff" }, // Amazon Prime (alternate ID)
  // Apple TV+
  350: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Disney+
  337: { bg: "#0063E5", hover: "#004EB5", text: "#ffffff" },
  // HBO Max / Max
  384: { bg: "#002BE7", hover: "#001FA6", text: "#ffffff" },
  1899: { bg: "#002BE7", hover: "#001FA6", text: "#ffffff" }, // Max
  // Hulu
  15: { bg: "#1CE783", hover: "#17B86A", text: "#000000" },
  // Paramount+
  531: { bg: "#0064FF", hover: "#004FCC", text: "#ffffff" },
  // Peacock
  387: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Crunchyroll
  283: { bg: "#F47521", hover: "#D4621A", text: "#ffffff" },
  // Funimation
  269: { bg: "#5B0BB5", hover: "#490994", text: "#ffffff" },
  // Starz
  43: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Showtime
  37: { bg: "#B10000", hover: "#8E0000", text: "#ffffff" },
  // Mubi
  11: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Curiosity Stream
  190: { bg: "#1A2737", hover: "#0F1A26", text: "#ffffff" },
  // YouTube Premium
  188: { bg: "#FF0000", hover: "#CC0000", text: "#ffffff" },
  // Tubi
  73: { bg: "#FA382F", hover: "#D42D25", text: "#ffffff" },
  // Pluto TV
  300: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Britbox
  380: { bg: "#1A1A2E", hover: "#0F0F1A", text: "#ffffff" },
  // Vudu
  7: { bg: "#3399FF", hover: "#2277CC", text: "#ffffff" },
  // Google Play
  3: { bg: "#01875F", hover: "#016B4C", text: "#ffffff" },
  // iTunes / Apple TV
  2: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Rakuten TV
  35: { bg: "#BF0050", hover: "#990040", text: "#ffffff" },
  // Now TV / Sky
  39: { bg: "#1EE590", hover: "#18B873", text: "#000000" },
  // Canal+
  381: { bg: "#1A1A1A", hover: "#333333", text: "#ffffff" },
  // Stan
  21: { bg: "#00AAFF", hover: "#0088CC", text: "#ffffff" },
  // Binge
  385: { bg: "#000000", hover: "#1a1a1a", text: "#ffffff" },
  // Foxtel Now
  134: { bg: "#F65E08", hover: "#C84D06", text: "#ffffff" },
  // SkyShowtime
  1773: { bg: "#0A1929", hover: "#061220", text: "#ffffff" },
  // WOW (Sky)
  30: { bg: "#0F3165", hover: "#0B244D", text: "#ffffff" },
  // RTL+
  298: { bg: "#E3000F", hover: "#B5000C", text: "#ffffff" },
  // Joyn
  421: { bg: "#1C1C1C", hover: "#333333", text: "#ffffff" },
  // Magenta TV
  178: { bg: "#E20074", hover: "#B5005D", text: "#ffffff" },
  // Videoland
  72: { bg: "#EE4036", hover: "#C4342C", text: "#ffffff" },
  // Viaplay
  76: { bg: "#181726", hover: "#0F0E1A", text: "#ffffff" },
};

const DEFAULT_PROVIDER_COLOR: ProviderColor = {
  bg: "#3F3F46", // zinc-700
  hover: "#52525B", // zinc-600
  text: "#ffffff",
};

export function getProviderColor(providerId: number): ProviderColor {
  return PROVIDER_COLORS[providerId] ?? DEFAULT_PROVIDER_COLOR;
}
