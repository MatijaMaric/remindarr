import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { getProviderColor } from "../data/providerColors";

interface WatchButtonProps {
  url: string;
  providerId: number;
  providerName: string;
  providerIconUrl: string;
  variant?: "compact" | "full";
  monetizationType?: string;
  className?: string;
}

function monetizationLabel(type?: string): string | null {
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

  if (variant === "compact") {
    return (
      <a
        href={url}
        target="_blank"
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
      href={url}
      target="_blank"
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
