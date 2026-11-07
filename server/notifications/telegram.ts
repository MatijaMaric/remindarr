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

const TELEGRAM_API = "https://api.telegram.org";

export class TelegramProvider implements NotificationProvider {
  readonly name = "telegram";

  validateConfig(config: Record<string, string>): {
    valid: boolean;
    error?: string;
  } {
    if (!config.botToken) {
      return { valid: false, error: "Bot token is required" };
    }
    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(config.botToken)) {
      return {
        valid: false,
        error: "Invalid bot token format (expected 123456:ABC...)",
      };
    }
    if (!config.chatId) {
      return { valid: false, error: "Chat ID is required" };
    }
    if (!/^-?\d+$/.test(config.chatId)) {
      return {
        valid: false,
        error: "Chat ID must be a number (e.g. -1001234567890)",
      };
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

    const text = this.buildMessage(content);
    const url = `${TELEGRAM_API}/bot${config.botToken}/sendMessage`;

    await traceHttp("POST", url, async () => {
      const response = await integrationFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        throw deliveryError("Telegram API error", response.status);
      }
    });
  }

  private buildMessage(content: NotificationContent): string {
    const {
      episodes,
      movies,
      date,
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

    const lines: string[] = [
      `<b>📺 Remindarr — ${escapeHtml(tr.t("todaySummary", { items: tr.join(parts), date }))}</b>`,
      "",
    ];

    const showMap = groupEpisodesByShow(episodes);

    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) =>
          `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
      );
      const providers = formatProviderNames(eps[0].offers);
      const providerStr = providers ? ` <i>(${providers})</i>` : "";
      lines.push(
        `🎬 <b>${escapeHtml(showTitle)}</b> — ${codes.join(", ")}${providerStr}`,
      );
    }

    for (const movie of movies) {
      const providers = formatProviderNames(movie.offers);
      const providerStr = providers ? ` <i>(${providers})</i>` : "";
      const label = movie.releaseYear
        ? `${movie.title} (${movie.releaseYear})`
        : movie.title;
      lines.push(`🎥 <b>${escapeHtml(label)}</b>${providerStr}`);
    }

    for (const alert of streamingAlerts) {
      if (alert.kind === "departure") {
        const copy = formatLeavingCopy(
          alert.providerName,
          alert.leavingAt,
          tr.lang,
        );
        lines.push(
          `🔕 <b>${escapeHtml(alert.title)}</b> — ${escapeHtml(copy)}`,
        );
      } else {
        lines.push(
          `🔔 <b>${escapeHtml(alert.title)}</b> — ${tr.t("nowOn", { provider: `<i>${escapeHtml(alert.providerName)}</i>` })}`,
        );
      }
    }

    if (achievementsEarned.length > 0) {
      lines.push("");
      lines.push(`<b>🏆 ${escapeHtml(tr.t("newBadgesHeading"))}</b>`);
      for (const ae of achievementsEarned) {
        lines.push(
          `🎖 <b>${escapeHtml(ae.title)}</b> +${ae.points} XP — <i>${escapeHtml(ae.description)}</i>`,
        );
      }
    }

    if (personCredits.length > 0) {
      lines.push("");
      lines.push(`<b>⭐ ${escapeHtml(tr.t("newFromFollowed"))}:</b>`);
      for (const pc of personCredits) {
        lines.push(`🎭 ${escapeHtml(formatPersonCredit(pc, tr.lang))}`);
      }
    }

    return lines.join("\n");
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
