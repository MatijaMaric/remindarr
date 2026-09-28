import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getProviderColor } from "../data/providerColors";
import { cn } from "../lib/utils";

export const PLEX_PROVIDER_ID = 9999;

type PlexPlatform = "ios" | "android" | "desktop";

export function getPlexPlatform(): PlexPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function plexDeepLink(webUrl: string, platform: PlexPlatform): string {
  try {
    const hashPart = webUrl.split("#!/")[1];
    const [pathPart, queryPart] = hashPart.split("?");
    const params = new URLSearchParams(queryPart);

    if (platform === "android") {
      // Use watch.plex.tv deep link if a slug was embedded by the server
      const slug = params.get("watchSlug");
      const mediaType = params.get("mediaType");
      if (slug && mediaType) {
        return `https://watch.plex.tv/${mediaType}/${slug}`;
      }
      return webUrl; // No slug — fall back to browser
    }

    // iOS: plex://preplay/?metadataKey=...&server=...
    const serverId = pathPart.split("/")[1];
    const metadataKey = params.get("key");
    if (!serverId || !metadataKey) return webUrl;
    return `plex://preplay/?metadataKey=${encodeURIComponent(metadataKey)}&server=${serverId}`;
  } catch {
    return webUrl;
  }
}

interface WatchButtonProps {
  url: string;
  providerId: number;
  providerName: string;
  providerIconUrl: string;
  variant?: "compact" | "full";
  monetizationType?: string;
  /** False when the user has subscriptions set and this provider isn't one. */
  subscribed?: boolean;
  className?: string;
}

export function monetizationLabel(type?: string): string | null {
  switch (type) {
    case "FLATRATE":
      return "Stream";
    case "FREE":
      return "Free";
    case "ADS":
      return "Ads";
    case "RENT":
      return "Rent";
    case "BUY":
      return "Buy";
    default:
      return null;
  }
}

const ACTION_KEYS: Record<string, string> = {
  FLATRATE: "watchAction.stream",
  FREE: "watchAction.free",
  ADS: "watchAction.ads",
  RENT: "watchAction.rent",
  BUY: "watchAction.buy",
};

/**
 * Accessible name for a link that leaves Remindarr for a streaming provider.
 * Names the provider and how it is offered (stream/rent/buy/free) so it is
 * never mistaken for in-app playback, marking watched, or tracking.
 */
export function watchActionLabel(
  t: TFunction,
  providerName: string,
  monetizationType?: string,
  opts: { subscribed?: boolean } = {},
): string {
  const key =
    (monetizationType && ACTION_KEYS[monetizationType]) || "watchAction.open";
  let action = t(key, { provider: providerName });
  if (opts.subscribed === false) {
    action = t("watchAction.notSubscribed", { action });
  }
  return t("watchAction.external", { action });
}

export default function WatchButton({
  url,
  providerId,
  providerName,
  providerIconUrl,
  variant = "compact",
  monetizationType,
  subscribed,
  className,
}: WatchButtonProps) {
  const { t } = useTranslation();
  const color = getProviderColor(providerId);
  const actionLabel = watchActionLabel(t, providerName, monetizationType, {
    subscribed,
  });
  const [hovered, setHovered] = useState(false);
  const isPlex = providerId === PLEX_PROVIDER_ID;
  const platform = isPlex ? getPlexPlatform() : "desktop";
  const useMobileDeepLink = platform === "ios" || platform === "android";
  const effectiveUrl = useMobileDeepLink ? plexDeepLink(url, platform) : url;
  const target = useMobileDeepLink ? undefined : "_blank";

  if (variant === "compact") {
    return (
      <a
        href={effectiveUrl}
        target={target}
        rel="noopener noreferrer"
        title={actionLabel}
        aria-label={actionLabel}
        className="block rounded-lg transition-all duration-200"
        style={{
          boxShadow: hovered
            ? `0 0 0 2px ${color.bg}`
            : "0 0 0 2px transparent",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <img
          src={providerIconUrl}
          alt={providerName}
          className="w-7 h-7 rounded-md"
          loading="lazy"
          width={28}
          height={28}
        />
      </a>
    );
  }

  const label = monetizationLabel(monetizationType);

  return (
    <a
      href={effectiveUrl}
      target={target}
      rel="noopener noreferrer"
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(
        "min-h-8 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
        className,
      )}
      style={{
        backgroundColor: hovered ? color.hover : color.bg,
        color: color.text,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label && <span className="opacity-75">{label}</span>}
      <img
        src={providerIconUrl}
        alt={providerName}
        className="w-5 h-5 rounded"
        loading="lazy"
        width={20}
        height={20}
      />
      <ExternalLink size={14} className="opacity-60" aria-hidden="true" />
    </a>
  );
}
