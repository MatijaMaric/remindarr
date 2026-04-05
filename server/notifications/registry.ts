import { DiscordProvider } from "./discord";
import { WebPushProvider } from "./webpush";
import { NtfyProvider } from "./ntfy";
import { WebhookProvider } from "./webhook";
import { TelegramProvider } from "./telegram";
import { GotifyProvider } from "./gotify";
import type { NotificationProvider } from "./types";

const providers = new Map<string, NotificationProvider>();
providers.set("discord", new DiscordProvider());
providers.set("webpush", new WebPushProvider());
providers.set("ntfy", new NtfyProvider());
providers.set("webhook", new WebhookProvider());
providers.set("telegram", new TelegramProvider());
providers.set("gotify", new GotifyProvider());

export function getProvider(name: string): NotificationProvider | undefined {
  return providers.get(name);
}

export function getAvailableProviders(): string[] {
  return [...providers.keys()];
}
