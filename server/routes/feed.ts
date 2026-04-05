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

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Remindarr//EN");
  lines.push("X-WR-CALNAME:Remindarr");
  lines.push("X-WR-TIMEZONE:UTC");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

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
    lines.push("END:VEVENT");
  }

  for (const movie of movies) {
    if (!movie.release_date) continue;
    const dtStart = dateToIcal(movie.release_date);
    const dtEnd = dateToIcal(addDays(movie.release_date, 1));
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:remindarr-movie-${movie.id}@remindarr`));
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(foldLine(`SUMMARY:${escapeIcal(movie.title)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";

  return c.body(body, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="remindarr.ics"',
    "Cache-Control": "no-cache, no-store",
  });
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
