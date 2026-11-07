import { CONFIG } from "../config";
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
import { deliveryError } from "./types";

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  thumbnail?: { url: string };
  footer?: { text: string };
  fields?: Array<{ name: string; value: string; inline: boolean }>;
}

const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/.+$/;

const EMBED_COLOR = 0x4f46e5; // indigo-600

export class DiscordProvider implements NotificationProvider {
  readonly name = "discord";

  validateConfig(config: Record<string, string>): {
    valid: boolean;
    error?: string;
  } {
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
    content: NotificationContent,
  ): Promise<void> {
    const embeds = this.buildEmbeds(content);
    if (embeds.length === 0) return;

    await traceHttp("POST", config.webhookUrl, async () => {
      const response = await integrationFetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Remindarr",
          embeds,
        }),
      });

      if (!response.ok) {
        throw deliveryError("Discord webhook failed", response.status);
      }
    });
  }

  private buildEmbeds(content: NotificationContent) {
    const embeds: DiscordEmbed[] = [];
    const {
      episodes,
      movies,
      date,
      streamingAlerts = [],
      achievementsEarned = [],
      personCredits = [],
    } = content;
    const tr = getTranslator(content.locale);

    if (
      episodes.length === 0 &&
      movies.length === 0 &&
      streamingAlerts.length === 0 &&
      achievementsEarned.length === 0 &&
      personCredits.length === 0
    )
      return [];

    // Header embed
    const parts: string[] = [];
    if (episodes.length > 0) {
      parts.push(tr.count("episodes", episodes.length));
    }
    if (movies.length > 0) {
      parts.push(tr.count("movies", movies.length));
    }

    const arrivalAlerts = streamingAlerts.filter((a) => a.kind === "arrival");
    const departureAlerts = streamingAlerts.filter(
      (a) => a.kind === "departure",
    );

    if (streamingAlerts.length > 0 || parts.length > 0) {
      const descParts: string[] = [];
      if (parts.length > 0)
        descParts.push(tr.t("releasingToday", { items: tr.join(parts) }));
      if (arrivalAlerts.length > 0) {
        descParts.push(tr.count("titlesNowStreaming", arrivalAlerts.length));
      }
      if (departureAlerts.length > 0) {
        descParts.push(tr.count("titlesLeavingSoon", departureAlerts.length));
      }
      embeds.push({
        title: `📺 ${tr.t("releasesFor", { date })}`,
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

      const embed: DiscordEmbed = {
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
        embed.footer = { text: tr.t("availableOn", { providers }) };
      }

      embeds.push(embed);
    }

    // Movie embeds
    for (const movie of movies) {
      const providers = formatProviderNames(movie.offers);
      const embed: DiscordEmbed = {
        title: movie.title,
        description: movie.releaseYear
          ? tr.t("movieYear", { year: movie.releaseYear })
          : tr.t("movie"),
        color: EMBED_COLOR,
      };

      if (movie.posterUrl) {
        embed.thumbnail = {
          url: `${CONFIG.TMDB_IMAGE_BASE_URL}/w185${movie.posterUrl}`,
        };
      }

      if (providers) {
        embed.footer = { text: tr.t("availableOn", { providers }) };
      }

      embeds.push(embed);
    }

    // Streaming alert embeds
    for (const alert of streamingAlerts) {
      const description =
        alert.kind === "departure"
          ? formatLeavingCopy(alert.providerName, alert.leavingAt, tr.lang)
          : tr.t("nowAvailableOn", { provider: `**${alert.providerName}**` });
      const embed: DiscordEmbed = {
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

    // Achievement embeds
    if (achievementsEarned.length > 0) {
      const fields = achievementsEarned.map((ae) => ({
        name: `${ae.title} · +${ae.points} XP`,
        value: ae.description,
        inline: false,
      }));
      embeds.push({
        title: `🏆 ${tr.t("newBadgesEarned")}`,
        color: 0xf59e0b, // amber-500
        fields,
      });
    }

    if (personCredits.length > 0) {
      embeds.push({
        title: `⭐ ${tr.t("newFromFollowed")}`,
        description: personCredits
          .map((pc) => formatPersonCredit(pc, tr.lang))
          .join("\n"),
        color: EMBED_COLOR,
      });
    }

    // Discord has a limit of 10 embeds per message
    return embeds.slice(0, 10);
  }
}
