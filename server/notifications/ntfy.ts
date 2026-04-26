import { traceHttp } from "../tracing";
import { httpFetch } from "../lib/http";
import { formatProviderNames, groupEpisodesByShow } from "./format";
import type { NotificationContent, NotificationProvider } from "./types";

export class NtfyProvider implements NotificationProvider {
  readonly name = "ntfy";

  validateConfig(config: Record<string, string>): { valid: boolean; error?: string } {
    if (!config.url) {
      return { valid: false, error: "Ntfy topic URL is required (e.g. https://ntfy.sh/my-topic)" };
    }
    try {
      const u = new URL(config.url);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { valid: false, error: "URL must use http or https" };
      }
      // Topic must be part of the path
      if (u.pathname === "/" || u.pathname === "") {
        return { valid: false, error: "URL must include a topic (e.g. https://ntfy.sh/my-topic)" };
      }
    } catch {
      return { valid: false, error: "Invalid URL" };
    }
    return { valid: true };
  }

  async send(config: Record<string, string>, content: NotificationContent): Promise<void> {
    const { episodes, movies, streamingAlerts = [] } = content;
    if (episodes.length === 0 && movies.length === 0 && streamingAlerts.length === 0) return;

    const title = this.buildTitle(content);
    const message = this.buildMessage(content);

    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      "Title": title,
      "Priority": "default",
      "Tags": "tv,movie",
    };

    if (config.token) {
      headers["Authorization"] = `Bearer ${config.token}`;
    }

    await traceHttp("POST", config.url, async () => {
      const response = await httpFetch(config.url, {
        method: "POST",
        headers,
        body: message,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Ntfy request failed (${response.status}): ${text}`);
      }
    });
  }

  private buildTitle(content: NotificationContent): string {
    const { episodes, movies, streamingAlerts = [] } = content;
    const parts: string[] = [];
    if (episodes.length > 0) parts.push(`${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`);
    if (movies.length > 0) parts.push(`${movies.length} movie${movies.length !== 1 ? "s" : ""}`);
    if (streamingAlerts.length > 0) parts.push(`${streamingAlerts.length} now streaming`);
    return `Remindarr — ${parts.join(" and ")}`;
  }

  private buildMessage(content: NotificationContent): string {
    const { streamingAlerts = [] } = content;
    const lines: string[] = [];

    const showMap = groupEpisodesByShow(content.episodes);

    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) => `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
      );
      const providers = formatProviderNames(eps[0].offers);
      lines.push(`${showTitle} ${codes.join(", ")}${providers ? ` · ${providers}` : ""}`);
    }

    for (const movie of content.movies) {
      const providers = formatProviderNames(movie.offers);
      const label = movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title;
      lines.push(`${label}${providers ? ` · ${providers}` : ""}`);
    }

    for (const alert of streamingAlerts) {
      lines.push(`${alert.title} — now on ${alert.providerName}`);
    }

    return lines.join("\n");
  }
}
