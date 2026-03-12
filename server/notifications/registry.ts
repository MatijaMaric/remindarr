import { DiscordProvider } from "./discord";
import type { NotificationProvider } from "./types";

const providers = new Map<string, NotificationProvider>();
providers.set("discord", new DiscordProvider());

export function getProvider(name: string): NotificationProvider | undefined {
  return providers.get(name);
}

export function getAvailableProviders(): string[] {
  return [...providers.keys()];
}
