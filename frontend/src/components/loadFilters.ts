import * as api from "../api";
import type { Provider } from "../types";

export async function loadFilters(): Promise<{
  genres: string[];
  providers: Provider[];
  languages: string[];
  regionProviderIds: number[];
  priorityLanguageCodes: string[];
}> {
  const [genresResult, providersResult, languagesResult] =
    await Promise.allSettled([
      api.getGenres(),
      api.getProviders(),
      api.getLanguages(),
    ]);

  return {
    genres:
      genresResult.status === "fulfilled" ? genresResult.value.genres : [],
    providers:
      providersResult.status === "fulfilled"
        ? providersResult.value.providers
        : [],
    languages:
      languagesResult.status === "fulfilled"
        ? languagesResult.value.languages
        : [],
    regionProviderIds:
      providersResult.status === "fulfilled"
        ? providersResult.value.regionProviderIds ?? []
        : [],
    priorityLanguageCodes:
      languagesResult.status === "fulfilled"
        ? languagesResult.value.priorityLanguageCodes ?? []
        : [],
  };
}
