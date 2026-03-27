export interface SAService {
  id: string;
  name: string;
  homePage: string;
  themeColorCode: string;
  imageSet: {
    lightThemeImage: string;
    darkThemeImage: string;
    whiteImage: string;
  };
}

export interface SAPrice {
  amount: string;
  currency: string;
  formatted: string;
}

export interface SAStreamingOption {
  service: SAService;
  type: "subscription" | "rent" | "buy" | "addon" | "free";
  link: string;
  quality?: "sd" | "hd" | "qhd" | "uhd";
  price?: SAPrice;
  expiresSoon?: boolean;
  expiresOn?: number;
  availableSince?: number;
}

export interface SAShow {
  itemType: "show" | "movie";
  showType?: "movie" | "series";
  imdbId?: string;
  tmdbId?: string;
  title: string;
  streamingOptions: Record<string, SAStreamingOption[]>;
}

export class RateLimitError extends Error {
  constructor(message = "Streaming Availability API rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}
