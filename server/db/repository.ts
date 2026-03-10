import { getDb } from "./schema";
import type { ParsedTitle } from "../justwatch/parser";
import { extractProviders } from "../justwatch/parser";
import { CONFIG } from "../config";

// ─── Title / Offer / Score upserts ───────────────────────────────────────────

export function upsertTitles(titles: ParsedTitle[]) {
  const db = getDb();

  const upsertTitle = db.prepare(`
    INSERT INTO titles (id, object_type, title, release_year, release_date, runtime_minutes,
      short_description, genres, imdb_id, tmdb_id, poster_url, age_certification, jw_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, release_year=excluded.release_year, release_date=excluded.release_date,
      runtime_minutes=excluded.runtime_minutes, short_description=excluded.short_description,
      genres=excluded.genres, imdb_id=excluded.imdb_id, tmdb_id=excluded.tmdb_id,
      poster_url=excluded.poster_url, age_certification=excluded.age_certification,
      jw_url=excluded.jw_url, updated_at=datetime('now')
  `);

  const upsertProvider = db.prepare(`
    INSERT INTO providers (id, name, technical_name, icon_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, technical_name=excluded.technical_name, icon_url=excluded.icon_url
  `);

  const deleteOffers = db.prepare("DELETE FROM offers WHERE title_id = ?");

  const insertOffer = db.prepare(`
    INSERT INTO offers (title_id, provider_id, monetization_type, presentation_type, price_value, price_currency, url, available_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertScore = db.prepare(`
    INSERT INTO scores (title_id, imdb_score, imdb_votes, tmdb_score, jw_rating)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(title_id) DO UPDATE SET
      imdb_score=excluded.imdb_score, imdb_votes=excluded.imdb_votes,
      tmdb_score=excluded.tmdb_score, jw_rating=excluded.jw_rating
  `);

  // Extract and upsert providers first
  const providers = extractProviders(titles);
  const providerTx = db.transaction(() => {
    for (const p of providers) {
      upsertProvider.run(p.id, p.name, p.technicalName, p.iconUrl);
    }
  });
  providerTx();

  const titleTx = db.transaction(() => {
    for (const t of titles) {
      upsertTitle.run(
        t.id, t.objectType, t.title, t.releaseYear, t.releaseDate,
        t.runtimeMinutes, t.shortDescription, JSON.stringify(t.genres),
        t.imdbId, t.tmdbId, t.posterUrl, t.ageCertification, t.jwUrl
      );

      // Replace offers
      deleteOffers.run(t.id);
      for (const o of t.offers) {
        insertOffer.run(
          o.titleId, o.providerId, o.monetizationType, o.presentationType,
          o.priceValue, o.priceCurrency, o.url, o.availableTo
        );
      }

      // Upsert scores
      upsertScore.run(t.id, t.scores.imdbScore, t.scores.imdbVotes, t.scores.tmdbScore, t.scores.jwRating);
    }
  });
  titleTx();

  return titles.length;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface TitleFilters {
  daysBack?: number;
  objectType?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}

export function getRecentTitles(filters: TitleFilters = {}, userId?: string) {
  const db = getDb();
  const { daysBack = 30, objectType, provider, limit = 100, offset = 0 } = filters;

  // Build params in SQL positional order: SELECT params first, then WHERE params
  const selectParams: any[] = [];
  const whereParams: any[] = [];
  const conditions: string[] = [];

  // is_tracked subquery param comes first (it's in the SELECT clause)
  const trackedSubquery = userId
    ? `(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = t.id AND tr.user_id = ?)) as is_tracked`
    : `0 as is_tracked`;

  if (userId) selectParams.push(userId);

  if (daysBack) {
    conditions.push("t.release_date >= date('now', ?)");
    whereParams.push(`-${daysBack} days`);
  }
  if (objectType) {
    conditions.push("t.object_type = ?");
    whereParams.push(objectType);
  }
  if (provider) {
    conditions.push("EXISTS (SELECT 1 FROM offers o2 JOIN providers p2 ON o2.provider_id = p2.id WHERE o2.title_id = t.id AND p2.technical_name = ?)");
    whereParams.push(provider);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db.prepare(`
    SELECT t.*, s.imdb_score, s.imdb_votes, s.tmdb_score, s.jw_rating,
      ${trackedSubquery}
    FROM titles t
    LEFT JOIN scores s ON s.title_id = t.id
    ${where}
    ORDER BY t.release_date DESC
    LIMIT ? OFFSET ?
  `).all(...selectParams, ...whereParams, limit, offset);

  return rows.map((row: any) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

export function getOffersForTitle(titleId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT o.*, p.name as provider_name, p.technical_name as provider_technical_name, p.icon_url as provider_icon_url
    FROM offers o
    JOIN providers p ON o.provider_id = p.id
    WHERE o.title_id = ?
  `).all(titleId);
}

// ─── Tracking (per-user) ────────────────────────────────────────────────────

export function trackTitle(titleId: string, userId: string, notes?: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tracked (title_id, user_id, notes) VALUES (?, ?, ?)
    ON CONFLICT(title_id, user_id) DO UPDATE SET notes=excluded.notes
  `).run(titleId, userId, notes || null);
}

export function untrackTitle(titleId: string, userId: string) {
  const db = getDb();
  db.prepare("DELETE FROM tracked WHERE title_id = ? AND user_id = ?").run(titleId, userId);
}

export function getTrackedTitles(userId: string) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.*, s.imdb_score, s.imdb_votes, s.tmdb_score, s.jw_rating,
      tr.tracked_at, tr.notes, 1 as is_tracked
    FROM tracked tr
    JOIN titles t ON t.id = tr.title_id
    LEFT JOIN scores s ON s.title_id = t.id
    WHERE tr.user_id = ?
    ORDER BY tr.tracked_at DESC
  `).all(userId);

  return rows.map((row: any) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: true,
    offers: getOffersForTitle(row.id),
  }));
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function searchLocalTitles(query: string, limit = 50, userId?: string) {
  const db = getDb();

  const trackedSubquery = userId
    ? `(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = t.id AND tr.user_id = ?)) as is_tracked`
    : `0 as is_tracked`;

  // Params in SQL positional order: SELECT (userId), then WHERE (query), then LIMIT
  const params: any[] = [];
  if (userId) params.push(userId);
  params.push(`%${query}%`, limit);

  const rows = db.prepare(`
    SELECT t.*, s.imdb_score, s.imdb_votes, s.tmdb_score, s.jw_rating,
      ${trackedSubquery}
    FROM titles t
    LEFT JOIN scores s ON s.title_id = t.id
    WHERE t.title LIKE ?
    ORDER BY t.release_date DESC
    LIMIT ?
  `).all(...params);

  return rows.map((row: any) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface MonthFilters {
  month: string; // YYYY-MM
  objectType?: string;
  provider?: string;
}

export function getTitlesByMonth(filters: MonthFilters, userId?: string) {
  const db = getDb();
  const { month, objectType, provider } = filters;

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

  const conditions: string[] = ["t.release_date >= ? AND t.release_date < ?"];
  const params: any[] = [startDate, nextMonth];

  // Only tracked titles for the given user
  if (userId) {
    conditions.push("EXISTS (SELECT 1 FROM tracked tr WHERE tr.title_id = t.id AND tr.user_id = ?)");
    params.push(userId);
  } else {
    conditions.push("0");
  }

  if (objectType) {
    conditions.push("t.object_type = ?");
    params.push(objectType);
  }
  if (provider) {
    conditions.push("EXISTS (SELECT 1 FROM offers o2 JOIN providers p2 ON o2.provider_id = p2.id WHERE o2.title_id = t.id AND p2.technical_name = ?)");
    params.push(provider);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const rows = db.prepare(`
    SELECT t.*, s.imdb_score, s.imdb_votes, s.tmdb_score, s.jw_rating, 1 as is_tracked
    FROM titles t
    LEFT JOIN scores s ON s.title_id = t.id
    ${where}
    ORDER BY t.release_date ASC
  `).all(...params);

  return rows.map((row: any) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

export function getProviders() {
  const db = getDb();
  return db.prepare("SELECT * FROM providers ORDER BY name").all();
}

// ─── Episodes ────────────────────────────────────────────────────────────────

export function upsertEpisodes(episodes: {
  title_id: string;
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
}[]) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO episodes (title_id, season_number, episode_number, name, overview, air_date, still_path, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(title_id, season_number, episode_number) DO UPDATE SET
      name=excluded.name, overview=excluded.overview, air_date=excluded.air_date,
      still_path=excluded.still_path, updated_at=datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const ep of episodes) {
      upsert.run(ep.title_id, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date, ep.still_path);
    }
  });
  tx();
  return episodes.length;
}

export function getEpisodesByMonth(filters: MonthFilters, userId?: string) {
  const db = getDb();
  const { month, objectType } = filters;

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

  if (objectType === "MOVIE") return [];
  if (!userId) return [];

  const rows = db.prepare(`
    SELECT e.*, t.title as show_title, t.poster_url
    FROM episodes e
    JOIN titles t ON t.id = e.title_id
    JOIN tracked tr ON tr.title_id = t.id AND tr.user_id = ?
    WHERE e.air_date >= ? AND e.air_date < ?
    ORDER BY e.air_date ASC, t.title ASC
  `).all(userId, startDate, nextMonth);

  return rows.map((row: any) => ({
    ...row,
    offers: getOffersForTitle(row.title_id),
  }));
}

export function deleteEpisodesForTitle(titleId: string) {
  const db = getDb();
  db.prepare("DELETE FROM episodes WHERE title_id = ?").run(titleId);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function createUser(
  username: string,
  passwordHash: string | null,
  displayName?: string,
  authProvider = "local",
  providerSubject?: string,
  isAdmin = false,
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, auth_provider, provider_subject, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, displayName || null, authProvider, providerSubject || null, isAdmin ? 1 : 0);
  return id;
}

export function getUserByUsername(username: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any | null;
}

export function getUserById(id: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any | null;
}

export function getUserByProviderSubject(authProvider: string, providerSubject: string) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM users WHERE auth_provider = ? AND provider_subject = ?"
  ).get(authProvider, providerSubject) as any | null;
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
  return row.count;
}

export function updateUserPassword(userId: string, passwordHash: string) {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(userId: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CONFIG.SESSION_DURATION_HOURS * 3600 * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
  `).run(id, userId, expiresAt);
  return id;
}

export function getSessionWithUser(token: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.auth_provider, u.is_admin
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(token) as any | null;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    auth_provider: row.auth_provider,
    is_admin: Boolean(row.is_admin),
  };
}

export function deleteSession(token: string) {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function deleteExpiredSessions() {
  const db = getDb();
  const result = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  if (result.changes > 0) {
    console.log(`[Auth] Cleaned up ${result.changes} expired sessions`);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any | null;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

export function deleteSetting(key: string) {
  const db = getDb();
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getSettingsByPrefix(prefix: string): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").all(`${prefix}%`) as any[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ─── OIDC Config Resolution ─────────────────────────────────────────────────

export function getOidcConfig() {
  const issuerUrl = CONFIG.OIDC_ISSUER_URL || getSetting("oidc_issuer_url") || "";
  const clientId = CONFIG.OIDC_CLIENT_ID || getSetting("oidc_client_id") || "";
  const clientSecret = CONFIG.OIDC_CLIENT_SECRET || getSetting("oidc_client_secret") || "";
  const redirectUri = CONFIG.OIDC_REDIRECT_URI || getSetting("oidc_redirect_uri") || "";

  return { issuerUrl, clientId, clientSecret, redirectUri };
}

export function isOidcConfigured(): boolean {
  const { issuerUrl, clientId, clientSecret } = getOidcConfig();
  return Boolean(issuerUrl && clientId && clientSecret);
}
