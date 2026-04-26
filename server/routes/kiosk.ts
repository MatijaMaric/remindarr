import { Hono } from "hono";
import { z } from "zod";
import {
  getUserByKioskToken,
  getKioskToken,
  setKioskToken,
  getEpisodesByDateRange,
  getUnwatchedEpisodes,
} from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { zValidator } from "../lib/validator";
import { localDateForTimezone, addDays } from "../utils/timezone";
import { ok, err } from "./response";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

const FIDELITY_VALUES = ["rich", "lite", "epaper"] as const;
type KioskFidelity = (typeof FIDELITY_VALUES)[number];

const REFRESH_SECONDS: Record<KioskFidelity, number> = {
  rich: 300,
  lite: 300,
  epaper: 1800,
};

// FLATRATE > FREE > ADS > any other monetization type
const OFFER_PRIORITY: Record<string, number> = { FLATRATE: 0, FREE: 1, ADS: 2 };

function pickProvider(offers: Array<{ provider_name?: string; monetization_type?: string | null }>): string | null {
  if (offers.length === 0) return null;
  const sorted = [...offers].sort((a, b) => {
    const pa = OFFER_PRIORITY[a.monetization_type ?? ""] ?? 99;
    const pb = OFFER_PRIORITY[b.monetization_type ?? ""] ?? 99;
    return pa - pb;
  });
  return sorted[0]?.provider_name ?? null;
}

function episodeKind(season: number, episode: number): "series" | "episode" {
  return season === 1 && episode === 1 ? "series" : "episode";
}

// ─── Auth-gated token management (registered before /:token to avoid shadowing) ──

// GET /api/kiosk/token  (requireAuth)
app.get("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = await getKioskToken(user.id);
  return c.json({ token });
});

// POST /api/kiosk/token/regenerate  (requireAuth)
app.post("/token/regenerate", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = crypto.randomUUID().replace(/-/g, "");
  await setKioskToken(user.id, token);
  return c.json({ token });
});

// DELETE /api/kiosk/token  (requireAuth)
app.delete("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  await setKioskToken(user.id, null);
  return new Response(null, { status: 204 });
});

// ─── Public dashboard ─────────────────────────────────────────────────────────

// GET /api/kiosk/:token?display=rich|lite|epaper  (public, token-authenticated)
app.get(
  "/:token",
  zValidator("param", z.object({ token: z.string().min(1).max(64) })),
  zValidator("query", z.object({ display: z.enum(FIDELITY_VALUES).optional() })),
  async (c) => {
    const { token } = c.req.valid("param");
    const { display } = c.req.valid("query");
    const fidelity: KioskFidelity = display ?? "rich";

    const user = await getUserByKioskToken(token);
    if (!user) return err(c, "Invalid kiosk token", 401);

    const timezone = c.req.header("X-Timezone") || "UTC";
    const today = localDateForTimezone(timezone);
    const tomorrow = addDays(today, 1);

    const [todayEpisodes, allUnwatched] = await Promise.all([
      getEpisodesByDateRange(today, tomorrow, user.id),
      getUnwatchedEpisodes(user.id, timezone),
    ]);

    // airing_now — first unwatched today, fall back to first today
    const airingNow = todayEpisodes.find((e) => !e.is_watched) ?? todayEpisodes[0] ?? null;

    // releasing_today — all episodes today, projected with provider + kind
    const releasingToday = todayEpisodes.map((e) => ({
      id: e.id,
      title_id: e.title_id,
      show_title: e.show_title,
      poster_url: e.poster_url,
      backdrop_url: e.backdrop_url,
      season_number: e.season_number,
      episode_number: e.episode_number,
      ep_title: e.name,
      air_date: e.air_date,
      provider: pickProvider(e.offers),
      kind: episodeKind(e.season_number, e.episode_number),
    }));

    // unwatched_queue — next unwatched episode per tracked show
    const seenTitles = new Set<string>();
    const queueRows = allUnwatched.filter((e) => {
      if (seenTitles.has(e.title_id)) return false;
      seenTitles.add(e.title_id);
      return true;
    });
    // Sort by air_date asc (oldest first, i.e. most overdue goes first)
    queueRows.sort((a, b) => {
      if (!a.air_date && !b.air_date) return 0;
      if (!a.air_date) return 1;
      if (!b.air_date) return -1;
      return a.air_date < b.air_date ? -1 : a.air_date > b.air_date ? 1 : 0;
    });
    const unwatchedQueue = queueRows.slice(0, 12).map((e) => ({
      id: e.id,
      title_id: e.title_id,
      show_title: e.show_title,
      poster_url: e.poster_url,
      season_number: e.season_number,
      episode_number: e.episode_number,
      ep_title: e.name,
      air_date: e.air_date,
      provider: pickProvider(e.offers),
      left: Math.max(0, (e.total_episodes ?? 0) - (e.watched_episodes_count ?? 0)),
    }));

    const airingNowProjected = airingNow
      ? {
          id: airingNow.id,
          title_id: airingNow.title_id,
          show_title: airingNow.show_title,
          poster_url: airingNow.poster_url,
          backdrop_url: airingNow.backdrop_url,
          season_number: airingNow.season_number,
          episode_number: airingNow.episode_number,
          ep_title: airingNow.name,
          air_date: airingNow.air_date,
          provider: pickProvider(airingNow.offers),
        }
      : null;

    const household = user.displayUsername ?? user.username;

    c.header("Cache-Control", "no-cache, no-store");
    return ok(c, {
      meta: {
        household,
        fidelity,
        refresh_interval_seconds: REFRESH_SECONDS[fidelity],
        generated_at: new Date().toISOString(),
      },
      airing_now: airingNowProjected,
      releasing_today: releasingToday,
      unwatched_queue: unwatchedQueue,
    });
  }
);

export default app;
