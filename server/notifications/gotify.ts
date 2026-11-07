import { traceHttp } from "../tracing";
import { integrationFetch } from "../lib/outbound";
import {
  formatPersonCredit,
  formatProviderNames,
  groupEpisodesByShow,
} from "./format";
import { formatLeavingCopy } from "./content";
import { getTranslator } from "./i18n";
import type { NotificationContent, NotificationProvider } from "./types";

export class GotifyProvider implements NotificationProvider {
  readonly name = "gotify";

  validateConfig(config: Record<string, string>): {
    valid: boolean;
    error?: string;
  } {
    if (!config.url) {
      return {
        valid: false,
        error:
          "Gotify server URL is required (e.g. https://gotify.example.com)",
      };
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

  async send(
    config: Record<string, string>,
    content: NotificationContent,
  ): Promise<void> {
    const {
      episodes,
      movies,
      streamingAlerts = [],
      achievementsEarned = [],
      personCredits = [],
    } = content;
    if (
      episodes.length === 0 &&
      movies.length === 0 &&
      streamingAlerts.length === 0 &&
      achievementsEarned.length === 0 &&
      personCredits.length === 0
    )
      return;

    const title = this.buildTitle(content);
    const message = this.buildMessage(content);
    const base = config.url.replace(/\/$/, "");
    const url = `${base}/message`;

    await traceHttp("POST", url, async () => {
      const response = await integrationFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gotify-Key": config.token,
        },
        body: JSON.stringify({ title, message, priority: 5 }),
      });

      if (!response.ok) {
        throw new Error(`Gotify request failed (${response.status})`);
      }
    });
  }

  private buildTitle(content: NotificationContent): string {
    const {
      episodes,
      movies,
      streamingAlerts = [],
      achievementsEarned = [],
      personCredits = [],
    } = content;
    const parts: string[] = [];
    const tr = getTranslator(content.locale);
    if (episodes.length > 0) parts.push(tr.count("episodes", episodes.length));
    if (movies.length > 0) parts.push(tr.count("movies", movies.length));
    if (streamingAlerts.length > 0)
      parts.push(tr.count("nowStreamingCount", streamingAlerts.length));
    if (achievementsEarned.length > 0)
      parts.push(tr.count("newBadges", achievementsEarned.length));
    if (personCredits.length > 0)
      parts.push(tr.count("newCredits", personCredits.length));
    return `Remindarr — ${tr.join(parts)}`;
  }

  private buildMessage(content: NotificationContent): string {
    const {
      streamingAlerts = [],
      achievementsEarned = [],
      personCredits = [],
    } = content;
    const tr = getTranslator(content.locale);
    const lines: string[] = [];

    const showMap = groupEpisodesByShow(content.episodes);

    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) =>
          `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
      );
      const providers = formatProviderNames(eps[0].offers);
      lines.push(
        `${showTitle} ${codes.join(", ")}${providers ? ` (${providers})` : ""}`,
      );
    }

    for (const movie of content.movies) {
      const providers = formatProviderNames(movie.offers);
      const label = movie.releaseYear
        ? `${movie.title} (${movie.releaseYear})`
        : movie.title;
      lines.push(`${label}${providers ? ` (${providers})` : ""}`);
    }

    for (const alert of streamingAlerts) {
      if (alert.kind === "departure") {
        lines.push(
          `${alert.title} — ${formatLeavingCopy(alert.providerName, alert.leavingAt, tr.lang)}`,
        );
      } else {
        lines.push(
          `${alert.title} — ${tr.t("nowOn", { provider: alert.providerName })}`,
        );
      }
    }

    if (achievementsEarned.length > 0) {
      lines.push("");
      lines.push(`🏆 ${tr.t("newBadgesHeading")}`);
      for (const ae of achievementsEarned) {
        lines.push(`${ae.title} +${ae.points} XP — ${ae.description}`);
      }
    }

    if (personCredits.length > 0) {
      lines.push("");
      lines.push(`⭐ ${tr.t("newFromFollowed")}:`);
      for (const pc of personCredits) {
        lines.push(formatPersonCredit(pc, tr.lang));
      }
    }

    return lines.join("\n");
  }
}
