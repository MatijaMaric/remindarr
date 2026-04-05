import { traceHttp } from "../tracing";
import type { NotificationContent, NotificationProvider } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export class TelegramProvider implements NotificationProvider {
  readonly name = "telegram";

  validateConfig(config: Record<string, string>): { valid: boolean; error?: string } {
    if (!config.botToken) {
      return { valid: false, error: "Bot token is required" };
    }
    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(config.botToken)) {
      return { valid: false, error: "Invalid bot token format (expected 123456:ABC...)" };
    }
    if (!config.chatId) {
      return { valid: false, error: "Chat ID is required" };
    }
    if (!/^-?\d+$/.test(config.chatId)) {
      return { valid: false, error: "Chat ID must be a number (e.g. -1001234567890)" };
    }
    return { valid: true };
  }

  async send(config: Record<string, string>, content: NotificationContent): Promise<void> {
    const { episodes, movies, streamingAlerts = [] } = content;
    if (episodes.length === 0 && movies.length === 0 && streamingAlerts.length === 0) return;

    const text = this.buildMessage(content);
    const url = `${TELEGRAM_API}/bot${config.botToken}/sendMessage`;

    await traceHttp("POST", url, async () => {
      const response = await fetch(url, {
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
        const json = await response.json().catch(() => ({}));
        throw new Error(`Telegram API error (${response.status}): ${json.description ?? "Unknown error"}`);
      }
    });
  }

  private buildMessage(content: NotificationContent): string {
    const { episodes, movies, date, streamingAlerts = [] } = content;
    const parts: string[] = [];
    if (episodes.length > 0) parts.push(`${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`);
    if (movies.length > 0) parts.push(`${movies.length} movie${movies.length !== 1 ? "s" : ""}`);
    if (streamingAlerts.length > 0) parts.push(`${streamingAlerts.length} now streaming`);

    const lines: string[] = [`<b>📺 Remindarr — ${parts.join(" and ")} today (${date})</b>`, ""];

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
      const providers = [...new Set(eps[0].offers.map((o) => o.providerName))].join(", ");
      const providerStr = providers ? ` <i>(${providers})</i>` : "";
      lines.push(`🎬 <b>${escapeHtml(showTitle)}</b> — ${codes.join(", ")}${providerStr}`);
    }

    for (const movie of movies) {
      const providers = [...new Set(movie.offers.map((o) => o.providerName))].join(", ");
      const providerStr = providers ? ` <i>(${providers})</i>` : "";
      const label = movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title;
      lines.push(`🎥 <b>${escapeHtml(label)}</b>${providerStr}`);
    }

    for (const alert of streamingAlerts) {
      lines.push(`🔔 <b>${escapeHtml(alert.title)}</b> — now on <i>${escapeHtml(alert.providerName)}</i>`);
    }

    return lines.join("\n");
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
