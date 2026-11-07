/**
 * Server-side message catalog for notification text. Mirrors the frontend's
 * supported UI languages; the user's `users.locale` (a BCP 47 tag such as
 * "de" or "pt-BR") is mapped by base language, falling back to English.
 *
 * Placeholders use `{name}`. Count messages are keyed by Intl.PluralRules
 * category and always define `other` (the fallback for missing categories,
 * and the only category Japanese uses).
 */

export const NOTIFICATION_LANGUAGES = [
  "en",
  "es",
  "de",
  "fr",
  "pt",
  "ja",
] as const;
export type NotificationLanguage = (typeof NOTIFICATION_LANGUAGES)[number];

type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string;
};

const en = {
  // Counts
  episodes: { one: "{n} episode", other: "{n} episodes" },
  movies: { one: "{n} movie", other: "{n} movies" },
  nowStreamingCount: { other: "{n} now streaming" },
  titlesNowStreaming: {
    one: "{n} title now streaming",
    other: "{n} titles now streaming",
  },
  titlesLeavingSoon: {
    one: "{n} title leaving soon",
    other: "{n} titles leaving soon",
  },
  newBadges: { one: "{n} new badge", other: "{n} new badges" },
  newCredits: { one: "{n} new credit", other: "{n} new credits" },
  newReleases: { one: "{n} new release", other: "{n} new releases" },
  // Phrases
  and: " and ",
  releasingToday: "{items} releasing today",
  todaySummary: "{items} today ({date})",
  releasesFor: "Releases for {date}",
  availableOn: "Available on: {providers}",
  movie: "Movie",
  movieYear: "Movie ({year})",
  nowAvailableOn: "Now available on {provider}",
  nowOn: "now on {provider}",
  leavingSoon: "Leaving {provider} soon",
  leavingOn: "Leaving {provider} on {date}",
  newBadgesEarned: "New badges earned",
  newBadgesHeading: "New badges:",
  newFromFollowed: "New from people you follow",
  creditRole: "{credit} as {role}",
} satisfies Record<string, string | PluralMessage>;

export type MessageKey = keyof typeof en;
type Catalog = Record<MessageKey, string | PluralMessage>;

const es: Catalog = {
  episodes: { one: "{n} episodio", other: "{n} episodios" },
  movies: { one: "{n} película", other: "{n} películas" },
  nowStreamingCount: { other: "{n} ya en streaming" },
  titlesNowStreaming: {
    one: "{n} título ya en streaming",
    other: "{n} títulos ya en streaming",
  },
  titlesLeavingSoon: {
    one: "{n} título se va pronto",
    other: "{n} títulos se van pronto",
  },
  newBadges: { one: "{n} insignia nueva", other: "{n} insignias nuevas" },
  newCredits: { one: "{n} crédito nuevo", other: "{n} créditos nuevos" },
  newReleases: { one: "{n} estreno nuevo", other: "{n} estrenos nuevos" },
  and: " y ",
  releasingToday: "Estrenos de hoy: {items}",
  todaySummary: "{items} hoy ({date})",
  releasesFor: "Estrenos del {date}",
  availableOn: "Disponible en: {providers}",
  movie: "Película",
  movieYear: "Película ({year})",
  nowAvailableOn: "Ya disponible en {provider}",
  nowOn: "ya en {provider}",
  leavingSoon: "Sale pronto de {provider}",
  leavingOn: "Sale de {provider} el {date}",
  newBadgesEarned: "Nuevas insignias obtenidas",
  newBadgesHeading: "Nuevas insignias:",
  newFromFollowed: "Novedades de las personas que sigues",
  creditRole: "{credit} como {role}",
};

const de: Catalog = {
  episodes: { one: "{n} Folge", other: "{n} Folgen" },
  movies: { one: "{n} Film", other: "{n} Filme" },
  nowStreamingCount: { other: "{n} jetzt im Stream" },
  titlesNowStreaming: {
    one: "{n} Titel jetzt im Stream",
    other: "{n} Titel jetzt im Stream",
  },
  titlesLeavingSoon: {
    one: "{n} Titel bald nicht mehr verfügbar",
    other: "{n} Titel bald nicht mehr verfügbar",
  },
  newBadges: { one: "{n} neues Abzeichen", other: "{n} neue Abzeichen" },
  newCredits: { one: "{n} neuer Credit", other: "{n} neue Credits" },
  newReleases: {
    one: "{n} neue Veröffentlichung",
    other: "{n} neue Veröffentlichungen",
  },
  and: " und ",
  releasingToday: "Heute neu: {items}",
  todaySummary: "{items} heute ({date})",
  releasesFor: "Neuerscheinungen am {date}",
  availableOn: "Verfügbar bei: {providers}",
  movie: "Film",
  movieYear: "Film ({year})",
  nowAvailableOn: "Jetzt verfügbar bei {provider}",
  nowOn: "jetzt bei {provider}",
  leavingSoon: "Bald nicht mehr bei {provider}",
  leavingOn: "Ab {date} nicht mehr bei {provider}",
  newBadgesEarned: "Neue Abzeichen erhalten",
  newBadgesHeading: "Neue Abzeichen:",
  newFromFollowed: "Neues von Personen, denen du folgst",
  creditRole: "{credit} als {role}",
};

const fr: Catalog = {
  episodes: { one: "{n} épisode", other: "{n} épisodes" },
  movies: { one: "{n} film", other: "{n} films" },
  nowStreamingCount: { other: "{n} désormais en streaming" },
  titlesNowStreaming: {
    one: "{n} titre désormais en streaming",
    other: "{n} titres désormais en streaming",
  },
  titlesLeavingSoon: {
    one: "{n} titre bientôt retiré",
    other: "{n} titres bientôt retirés",
  },
  newBadges: { one: "{n} nouveau badge", other: "{n} nouveaux badges" },
  newCredits: { one: "{n} nouveau crédit", other: "{n} nouveaux crédits" },
  newReleases: {
    one: "{n} nouvelle sortie",
    other: "{n} nouvelles sorties",
  },
  and: " et ",
  releasingToday: "Sorties du jour : {items}",
  todaySummary: "{items} aujourd'hui ({date})",
  releasesFor: "Sorties du {date}",
  availableOn: "Disponible sur : {providers}",
  movie: "Film",
  movieYear: "Film ({year})",
  nowAvailableOn: "Désormais disponible sur {provider}",
  nowOn: "désormais sur {provider}",
  leavingSoon: "Quitte bientôt {provider}",
  leavingOn: "Quitte {provider} le {date}",
  newBadgesEarned: "Nouveaux badges obtenus",
  newBadgesHeading: "Nouveaux badges :",
  newFromFollowed: "Nouveautés des personnes que vous suivez",
  creditRole: "{credit} en tant que {role}",
};

const pt: Catalog = {
  episodes: { one: "{n} episódio", other: "{n} episódios" },
  movies: { one: "{n} filme", other: "{n} filmes" },
  nowStreamingCount: { other: "{n} já em streaming" },
  titlesNowStreaming: {
    one: "{n} título já em streaming",
    other: "{n} títulos já em streaming",
  },
  titlesLeavingSoon: {
    one: "{n} título saindo em breve",
    other: "{n} títulos saindo em breve",
  },
  newBadges: { one: "{n} novo emblema", other: "{n} novos emblemas" },
  newCredits: { one: "{n} novo crédito", other: "{n} novos créditos" },
  newReleases: { one: "{n} novo lançamento", other: "{n} novos lançamentos" },
  and: " e ",
  releasingToday: "Lançamentos de hoje: {items}",
  todaySummary: "{items} hoje ({date})",
  releasesFor: "Lançamentos de {date}",
  availableOn: "Disponível em: {providers}",
  movie: "Filme",
  movieYear: "Filme ({year})",
  nowAvailableOn: "Já disponível em {provider}",
  nowOn: "já em {provider}",
  leavingSoon: "Sai de {provider} em breve",
  leavingOn: "Sai de {provider} em {date}",
  newBadgesEarned: "Novos emblemas conquistados",
  newBadgesHeading: "Novos emblemas:",
  newFromFollowed: "Novidades de pessoas que você segue",
  creditRole: "{credit} como {role}",
};

const ja: Catalog = {
  episodes: { other: "エピソード{n}件" },
  movies: { other: "映画{n}本" },
  nowStreamingCount: { other: "配信開始{n}件" },
  titlesNowStreaming: { other: "{n}作品が配信開始" },
  titlesLeavingSoon: { other: "{n}作品がまもなく配信終了" },
  newBadges: { other: "新しいバッジ{n}個" },
  newCredits: { other: "新しいクレジット{n}件" },
  newReleases: { other: "新着{n}件" },
  and: "、",
  releasingToday: "本日公開: {items}",
  todaySummary: "本日: {items}（{date}）",
  releasesFor: "{date}の新作",
  availableOn: "配信: {providers}",
  movie: "映画",
  movieYear: "映画（{year}年）",
  nowAvailableOn: "{provider}で配信開始",
  nowOn: "{provider}で配信中",
  leavingSoon: "まもなく{provider}で配信終了",
  leavingOn: "{date}に{provider}で配信終了",
  newBadgesEarned: "新しいバッジを獲得",
  newBadgesHeading: "新しいバッジ:",
  newFromFollowed: "フォロー中の人の新作",
  creditRole: "{credit}（{role}）",
};

export const CATALOGS: Record<NotificationLanguage, Catalog> = {
  en,
  es,
  de,
  fr,
  pt,
  ja,
};

/** Map a BCP 47 tag ("pt-BR", "de", null) to a supported language; English by default. */
export function resolveNotificationLanguage(
  locale: string | null | undefined,
): NotificationLanguage {
  const base = locale?.toLowerCase().split(/[-_]/)[0];
  return (NOTIFICATION_LANGUAGES as readonly string[]).includes(base ?? "")
    ? (base as NotificationLanguage)
    : "en";
}

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export interface NotificationTranslator {
  readonly lang: NotificationLanguage;
  /** Simple (non-count) message. */
  t(key: MessageKey, vars?: Record<string, string | number>): string;
  /** Count message, pluralized with Intl.PluralRules; `{n}` is the count. */
  count(
    key: MessageKey,
    n: number,
    vars?: Record<string, string | number>,
  ): string;
  /** Joins summary parts with the language's "and" (e.g. "1 episode and 2 movies"). */
  join(parts: string[]): string;
  /** Formats an ISO date as a short localized date in UTC ("Jun 1, 2025"). */
  formatDate(date: Date): string;
}

const translatorCache = new Map<NotificationLanguage, NotificationTranslator>();

export function getTranslator(
  locale: string | null | undefined,
): NotificationTranslator {
  const lang = resolveNotificationLanguage(locale);
  const cached = translatorCache.get(lang);
  if (cached) return cached;

  const catalog = CATALOGS[lang];
  const plural = new Intl.PluralRules(lang);
  const dateFormat = new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const resolve = (key: MessageKey, n?: number): string => {
    const msg = catalog[key] ?? en[key];
    if (typeof msg === "string") return msg;
    if (n === undefined) return msg.other;
    return msg[plural.select(n)] ?? msg.other;
  };

  const translator: NotificationTranslator = {
    lang,
    t: (key, vars = {}) => interpolate(resolve(key), vars),
    count: (key, n, vars = {}) => interpolate(resolve(key, n), { ...vars, n }),
    join: (parts) => parts.join(resolve("and")),
    formatDate: (date) => dateFormat.format(date),
  };
  translatorCache.set(lang, translator);
  return translator;
}
