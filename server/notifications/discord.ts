import { CONFIG } from "../config";
import { traceHttp } from "../tracing";
import { httpFetch } from "../lib/http";
import { formatProviderNames, groupEpisodesByShow } from "./format";
import { formatLeavingCopy } from "./content";
import type { NotificationContent, NotificationProvider } from "./types";

const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/.+$/;

const EMBED_COLOR = 0x4f46e5; // indigo-600

export class DiscordProvider implements NotificationProvider {
  readonly name = "discord";

  validateConfig(
    config: Record<string, string>
  ): { valid: boolean; error?: string } {
    if (!config.webhookUrl) {
      return { valid: false, error: "Webhook URL is required" };
    }
    if (!DISCORD_WEBHOOK_PATTERN.test(config.webhookUrl)) {
      return {
        valid: false,
        error: "Invalid Discord webhook URL",
      };
    }
    return { valid: true };
  }

  async send(
    config: Record<string, string>,
    content: NotificationContent
  ): Promise<void> {
    const embeds = this.buildEmbeds(content);
    if (embeds.length === 0) return;

    await traceHttp("POST", config.webhookUrl, async () => {
      const response = await httpFetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Remindarr",
          embeds,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Discord webhook failed (${response.status}): ${text}`
        );
      }
    });
  }

  private buildEmbeds(content: NotificationContent) {
    const embeds: any[] = [];
    const { episodes, movies, date, streamingAlerts = [] } = content;

    if (episodes.length === 0 && movies.length === 0 && streamingAlerts.length === 0) return [];

    // Header embed
    const parts: string[] = [];
    if (episodes.length > 0) {
      parts.push(`${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`);
    }
    if (movies.length > 0) {
      parts.push(`${movies.length} movie${movies.length !== 1 ? "s" : ""}`);
    }

    const arrivalAlerts = streamingAlerts.filter((a) => a.kind === "arrival");
    const departureAlerts = streamingAlerts.filter((a) => a.kind === "departure");

    if (streamingAlerts.length > 0 || parts.length > 0) {
      const descParts: string[] = [];
      if (parts.length > 0) descParts.push(`${parts.join(" and ")} releasing today`);
      if (arrivalAlerts.length > 0) {
        descParts.push(`${arrivalAlerts.length} title${arrivalAlerts.length !== 1 ? "s" : ""} now streaming`);
      }
      if (departureAlerts.length > 0) {
        descParts.push(`${departureAlerts.length} title${departureAlerts.length !== 1 ? "s" : ""} leaving soon`);
      }
      embeds.push({
        title: `📺 Releases for ${date}`,
        description: descParts.join(" · "),
        color: EMBED_COLOR,
      });
    }

    // Episode embeds (grouped by show)
    const showMap = groupEpisodesByShow(episodes);

    for (const [showTitle, eps] of showMap) {
      const episodeLines = eps.map((ep) => {
        const code = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return ep.episodeName
          ? `**${code}** — ${ep.episodeName}`
          : `**${code}**`;
      });

      const providers = formatProviderNames(eps[0].offers);

      const embed: any = {
        title: showTitle,
        description: episodeLines.join("\n"),
        color: EMBED_COLOR,
      };

      if (eps[0].posterUrl) {
        embed.thumbnail = {
          url: `${CONFIG.TMDB_IMAGE_BASE_URL}/w185${eps[0].posterUrl}`,
        };
      }

      if (providers) {
        embed.footer = { text: `Available on: ${providers}` };
      }

      embeds.push(embed);
    }

    // Movie embeds
    for (const movie of movies) {
      const providers = formatProviderNames(movie.offers);
      const embed: any = {
        title: movie.title,
        description: movie.releaseYear
          ? `Movie (${movie.releaseYear})`
          : "Movie",
        color: EMBED_COLOR,
      };

      if (movie.posterUrl) {
        embed.thumbnail = {
          url: `${CONFIG.TMDB_IMAGE_BASE_URL}/w185${movie.posterUrl}`,
        };
      }

      if (providers) {
        embed.footer = { text: `Available on: ${providers}` };
      }

      embeds.push(embed);
    }

    // Streaming alert embeds
    for (const alert of streamingAlerts) {
      const description = alert.kind === "departure"
        ? formatLeavingCopy(alert.providerName, alert.leavingAt)
        : `Now available on **${alert.providerName}**`;
      const embed: any = {
        title: `🎬 ${alert.title}`,
        description,
        color: EMBED_COLOR,
      };
      if (alert.posterUrl) {
        embed.thumbnail = {
          url: `${CONFIG.TMDB_IMAGE_BASE_URL}/w185${alert.posterUrl}`,
        };
      }
      embeds.push(embed);
    }

    // Discord has a limit of 10 embeds per message
    return embeds.slice(0, 10);
  }
}
