import { Hono } from "hono";
import {
  getUserByFeedToken,
  getFeedToken,
  setFeedToken,
  getEpisodesByDateRange,
  getUpcomingTrackedMovies,
} from "../db/repository";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  const result: string[] = [];
  while (line.length > 75) {
    result.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  result.push(line);
  return result.join("\r\n");
}

function dateToIcal(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function buildIcalHeader(name: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Remindarr//EN",
    `X-WR-CALNAME:${escapeIcal(name)}`,
    "X-WR-TIMEZONE:UTC",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
}

function buildIcalFooter(): string[] {
  return ["END:VCALENDAR"];
}

function buildEpisodeVEvents(
  episodes: Awaited<ReturnType<typeof getEpisodesByDateRange>>
): string[] {
  const lines: string[] = [];
  for (const ep of episodes) {
    if (!ep.air_date) continue;
    const dtStart = dateToIcal(ep.air_date);
    const dtEnd = dateToIcal(addDays(ep.air_date, 1));
    const epLabel = `S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`;
    const summary = ep.name
      ? `${escapeIcal(ep.show_title)} ${epLabel} – ${escapeIcal(ep.name)}`
      : `${escapeIcal(ep.show_title)} ${epLabel}`;
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:remindarr-episode-${ep.id}@remindarr`));
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(foldLine(`SUMMARY:${summary}`));
    lines.push("CATEGORIES:EPISODE");
    lines.push("END:VEVENT");
  }
  return lines;
}

function buildMovieVEvents(
  movies: Awaited<ReturnType<typeof getUpcomingTrackedMovies>>
): string[] {
  const lines: string[] = [];
  for (const movie of movies) {
    if (!movie.release_date) continue;
    const dtStart = dateToIcal(movie.release_date);
    const dtEnd = dateToIcal(addDays(movie.release_date, 1));
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:remindarr-movie-${movie.id}@remindarr`));
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(foldLine(`SUMMARY:${escapeIcal(movie.title)}`));
    lines.push("CATEGORIES:RELEASE");
    lines.push("END:VEVENT");
  }
  return lines;
}

function buildIcsResponse(lines: string[]): { body: string; headers: Record<string, string> } {
  const body = lines.join("\r\n") + "\r\n";
  return {
    body,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="remindarr.ics"',
      "Cache-Control": "no-cache, no-store",
    },
  };
}

// GET /api/feed/calendar.ics?token=<token>  (public, token-authenticated)
app.get("/calendar.ics", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token" }, 401);

  const user = await getUserByFeedToken(token);
  if (!user) return c.json({ error: "Invalid token" }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const endDate = addDays(today, 90);

  const [episodes, movies] = await Promise.all([
    getEpisodesByDateRange(today, endDate, user.id),
    getUpcomingTrackedMovies(user.id, today, endDate),
  ]);

  const lines: string[] = [
    ...buildIcalHeader("Remindarr"),
    ...buildEpisodeVEvents(episodes),
    ...buildMovieVEvents(movies),
    ...buildIcalFooter(),
  ];

  const { body, headers } = buildIcsResponse(lines);
  return c.body(body, 200, headers);
});

// GET /api/feed/episodes.ics?token=<token>  (public, token-authenticated)
app.get("/episodes.ics", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token" }, 401);

  const user = await getUserByFeedToken(token);
  if (!user) return c.json({ error: "Invalid token" }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const endDate = addDays(today, 90);

  const episodes = await getEpisodesByDateRange(today, endDate, user.id);

  const lines: string[] = [
    ...buildIcalHeader("Remindarr – Episodes"),
    ...buildEpisodeVEvents(episodes),
    ...buildIcalFooter(),
  ];

  const { body, headers } = buildIcsResponse(lines);
  return c.body(body, 200, headers);
});

// GET /api/feed/releases.ics?token=<token>  (public, token-authenticated)
app.get("/releases.ics", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token" }, 401);

  const user = await getUserByFeedToken(token);
  if (!user) return c.json({ error: "Invalid token" }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const endDate = addDays(today, 90);

  const movies = await getUpcomingTrackedMovies(user.id, today, endDate);

  const lines: string[] = [
    ...buildIcalHeader("Remindarr – Releases"),
    ...buildMovieVEvents(movies),
    ...buildIcalFooter(),
  ];

  const { body, headers } = buildIcsResponse(lines);
  return c.body(body, 200, headers);
});

// GET /api/feed/streaming.ics?token=<token>  (public, token-authenticated)
// Streaming alerts do not have date-ranged calendar events; emits a valid but
// empty VCALENDAR as a placeholder for future expansion.
app.get("/streaming.ics", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token" }, 401);

  const user = await getUserByFeedToken(token);
  if (!user) return c.json({ error: "Invalid token" }, 401);

  const lines: string[] = [
    ...buildIcalHeader("Remindarr – Streaming Alerts"),
    // No VEVENT entries — streaming alerts track arrival/departure history and
    // do not have future calendar dates to publish.
    ...buildIcalFooter(),
  ];

  const { body, headers } = buildIcsResponse(lines);
  return c.body(body, 200, headers);
});

// GET /api/feed/token  (requireAuth)
app.get("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = await getFeedToken(user.id);
  return c.json({ token });
});

// POST /api/feed/token/regenerate  (requireAuth)
app.post("/token/regenerate", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = crypto.randomUUID().replace(/-/g, "");
  await setFeedToken(user.id, token);
  return c.json({ token });
});

export default app;
