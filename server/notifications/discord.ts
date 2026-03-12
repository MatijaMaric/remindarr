import { CONFIG } from "../config";
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

    const response = await fetch(config.webhookUrl, {
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
  }

  private buildEmbeds(content: NotificationContent) {
    const embeds: any[] = [];
    const { episodes, movies, date } = content;

    if (episodes.length === 0 && movies.length === 0) return [];

    // Header embed
    const parts: string[] = [];
    if (episodes.length > 0) {
      parts.push(`${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`);
    }
    if (movies.length > 0) {
      parts.push(`${movies.length} movie${movies.length !== 1 ? "s" : ""}`);
    }

    embeds.push({
      title: `📺 Releases for ${date}`,
      description: `${parts.join(" and ")} releasing today`,
      color: EMBED_COLOR,
    });

    // Episode embeds (grouped by show)
    const showMap = new Map<
      string,
      typeof episodes
    >();
    for (const ep of episodes) {
      const existing = showMap.get(ep.showTitle) || [];
      existing.push(ep);
      showMap.set(ep.showTitle, existing);
    }

    for (const [showTitle, eps] of showMap) {
      const episodeLines = eps.map((ep) => {
        const code = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return ep.episodeName
          ? `**${code}** — ${ep.episodeName}`
          : `**${code}**`;
      });

      const providers = this.formatProviders(eps[0].offers);

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
      const providers = this.formatProviders(movie.offers);
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

    // Discord has a limit of 10 embeds per message
    return embeds.slice(0, 10);
  }

  private formatProviders(
    offers: Array<{ providerName: string; providerIconUrl: string | null }>
  ): string {
    const unique = [...new Set(offers.map((o) => o.providerName))];
    return unique.join(", ");
  }
}
