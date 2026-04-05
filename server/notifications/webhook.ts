import { traceHttp } from "../tracing";
import type { NotificationContent, NotificationProvider } from "./types";

export class WebhookProvider implements NotificationProvider {
  readonly name = "webhook";

  validateConfig(config: Record<string, string>): { valid: boolean; error?: string } {
    if (!config.url) {
      return { valid: false, error: "Webhook URL is required" };
    }
    try {
      const u = new URL(config.url);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { valid: false, error: "URL must use http or https" };
      }
    } catch {
      return { valid: false, error: "Invalid URL" };
    }
    return { valid: true };
  }

  async send(config: Record<string, string>, content: NotificationContent): Promise<void> {
    const { episodes, movies } = content;
    if (episodes.length === 0 && movies.length === 0) return;

    const payload = this.buildPayload(content);
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Remindarr/1.0",
    };

    if (config.secret) {
      headers["X-Remindarr-Signature"] = await this.sign(body, config.secret);
    }

    await traceHttp("POST", config.url, async () => {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Webhook request failed (${response.status}): ${text}`);
      }
    });
  }

  private buildPayload(content: NotificationContent) {
    const { episodes, movies, date } = content;

    const summaryLines: string[] = [];
    const showMap = new Map<string, typeof episodes>();
    for (const ep of episodes) {
      const existing = showMap.get(ep.showTitle) ?? [];
      existing.push(ep);
      showMap.set(ep.showTitle, existing);
    }
    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) => `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
      );
      summaryLines.push(`${showTitle} ${codes.join(", ")}`);
    }
    for (const movie of movies) {
      summaryLines.push(movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title);
    }

    const total = episodes.length + movies.length;
    return {
      source: "remindarr",
      date,
      title: `Remindarr — ${total} new release${total !== 1 ? "s" : ""}`,
      summary: summaryLines.join(", "),
      episodes: episodes.map((ep) => ({
        show: ep.showTitle,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        name: ep.episodeName,
        providers: ep.offers.map((o) => o.providerName),
      })),
      movies: movies.map((m) => ({
        title: m.title,
        year: m.releaseYear,
        providers: m.offers.map((o) => o.providerName),
      })),
    };
  }

  private async sign(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    return "sha256=" + Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
