import { traceHttp } from "../tracing";
import type { NotificationContent, NotificationProvider } from "./types";

export class GotifyProvider implements NotificationProvider {
  readonly name = "gotify";

  validateConfig(config: Record<string, string>): { valid: boolean; error?: string } {
    if (!config.url) {
      return { valid: false, error: "Gotify server URL is required (e.g. https://gotify.example.com)" };
    }
    try {
      const u = new URL(config.url);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { valid: false, error: "URL must use http or https" };
      }
    } catch {
      return { valid: false, error: "Invalid URL" };
    }
    if (!config.token) {
      return { valid: false, error: "Application token is required" };
    }
    return { valid: true };
  }

  async send(config: Record<string, string>, content: NotificationContent): Promise<void> {
    const { episodes, movies } = content;
    if (episodes.length === 0 && movies.length === 0) return;

    const title = this.buildTitle(content);
    const message = this.buildMessage(content);
    const base = config.url.replace(/\/$/, "");
    const url = `${base}/message?token=${encodeURIComponent(config.token)}`;

    await traceHttp("POST", url, async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, priority: 5 }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Gotify request failed (${response.status}): ${text}`);
      }
    });
  }

  private buildTitle(content: NotificationContent): string {
    const { episodes, movies } = content;
    const parts: string[] = [];
    if (episodes.length > 0) parts.push(`${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`);
    if (movies.length > 0) parts.push(`${movies.length} movie${movies.length !== 1 ? "s" : ""}`);
    return `Remindarr — ${parts.join(" and ")} today`;
  }

  private buildMessage(content: NotificationContent): string {
    const lines: string[] = [];

    const showMap = new Map<string, typeof content.episodes>();
    for (const ep of content.episodes) {
      const existing = showMap.get(ep.showTitle) ?? [];
      existing.push(ep);
      showMap.set(ep.showTitle, existing);
    }

    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) => `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
      );
      const providers = [...new Set(eps[0].offers.map((o) => o.providerName))].join(", ");
      lines.push(`${showTitle} ${codes.join(", ")}${providers ? ` (${providers})` : ""}`);
    }

    for (const movie of content.movies) {
      const providers = [...new Set(movie.offers.map((o) => o.providerName))].join(", ");
      const label = movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title;
      lines.push(`${label}${providers ? ` (${providers})` : ""}`);
    }

    return lines.join("\n");
  }
}
