export interface JWTitle {
  id: string;
  objectType: "MOVIE" | "SHOW";
  content: {
    title: string;
    fullPath: string;
    originalReleaseYear: number;
    originalReleaseDate: string;
    runtime: number | null;
    shortDescription: string;
    genres: { shortName: string; translation: string }[];
    externalIds: { imdbId: string | null; tmdbId: string | null };
    posterUrl: string | null;
    ageCertification: string | null;
    scoring: {
      imdbScore: number | null;
      imdbVotes: number | null;
      tmdbScore: number | null;
      tmdbPopularity: number | null;
      jwRating: number | null;
    };
  };
  offers: JWOffer[] | null;
}

export interface JWOffer {
  id: string;
  monetizationType: string;
  presentationType: string;
  retailPrice: number | null;
  retailPriceValue: number | null;
  currency: string;
  standardWebURL: string;
  package: {
    packageId: number;
    clearName: string;
    technicalName: string;
    icon: string;
  };
  availableTo: string | null;
}

export interface JWProvider {
  id: number;
  name: string;
  technicalName: string;
  iconUrl: string;
}

export interface JWPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface JWPopularTitlesResponse {
  data: {
    popularTitles: {
      edges: { node: JWTitle }[];
      pageInfo: JWPageInfo;
      totalCount: number;
    };
  };
}

export interface JWSearchResponse {
  data: {
    popularTitles: {
      edges: { node: JWTitle }[];
      pageInfo: JWPageInfo;
      totalCount: number;
    };
  };
}
