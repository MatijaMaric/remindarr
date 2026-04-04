import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { getProviderColor } from "../data/providerColors";

export const PLEX_PROVIDER_ID = 9999;

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function plexDeepLink(webUrl: string): string {
  // Input:  https://app.plex.tv/#!/server/{serverId}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}
  // Output: plex://preplay/?metadataKey=/library/metadata/{ratingKey}&server={serverId}
  try {
    const hashPart = webUrl.split("#!/")[1];
    const [pathPart, queryPart] = hashPart.split("?");
    const serverId = pathPart.split("/")[1];
    const metadataKey = new URLSearchParams(queryPart).get("key");
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
  className?: string;
}

export function monetizationLabel(type?: string): string | null {
  switch (type) {
    case "FLATRATE": return "Stream";
    case "FREE": return "Free";
    case "ADS": return "Ads";
    case "RENT": return "Rent";
    case "BUY": return "Buy";
    default: return null;
  }
}

export default function WatchButton({
  url,
  providerId,
  providerName,
  providerIconUrl,
  variant = "compact",
  monetizationType,
  className,
}: WatchButtonProps) {
  const color = getProviderColor(providerId);
  const [hovered, setHovered] = useState(false);
  const isPlex = providerId === PLEX_PROVIDER_ID;
  const useMobileDeepLink = isPlex && isMobileDevice();
  const effectiveUrl = useMobileDeepLink ? plexDeepLink(url) : url;
  const target = useMobileDeepLink ? undefined : "_blank";

  if (variant === "compact") {
    return (
      <a
        href={effectiveUrl}
        target={target}
        rel="noopener noreferrer"
        title={providerName}
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
      className={`min-h-8 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 ${className?.match(/\btext-(xs|sm|base|lg|xl|\d)/) ? "" : "text-xs"} font-semibold transition-colors duration-200 ${className ?? ""}`}
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
      />
      <ExternalLink size={14} className="opacity-60" />
    </a>
  );
}
