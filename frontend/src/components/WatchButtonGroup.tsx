import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import type { Offer } from "../types";
import WatchButton, { monetizationLabel } from "./WatchButton";
import { getUniqueProviders } from "./EpisodeComponents";
import { getProviderColor } from "../data/providerColors";

interface Props {
  offers: Offer[];
  variant?: "dropdown" | "inline";
  maxVisible?: number;
  size?: "sm" | "lg";
  fullWidth?: boolean;
}

export default function WatchButtonGroup({ offers, variant = "dropdown", maxVisible = 4, size = "sm", fullWidth }: Props) {
  const providers = getUniqueProviders(offers);
  if (providers.length === 0) return null;

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap gap-2">
        {providers.slice(0, maxVisible).map((o) => (
          <WatchButton
            key={o.provider_id}
            url={o.url}
            providerId={o.provider_id}
            providerName={o.provider_name}
            providerIconUrl={o.provider_icon_url}
            monetizationType={o.monetization_type}
            variant="full"
          />
        ))}
      </div>
    );
  }

  // dropdown variant — single provider: plain button, no caret
  if (providers.length === 1) {
    const isLg = size === "lg";
    return (
      <WatchButton
        url={providers[0].url}
        providerId={providers[0].provider_id}
        providerName={providers[0].provider_name}
        providerIconUrl={providers[0].provider_icon_url}
        monetizationType={providers[0].monetization_type}
        variant="full"
        className={isLg ? "w-full justify-center px-6 py-3 rounded-xl text-base font-semibold" : fullWidth ? "w-full justify-center" : undefined}
      />
    );
  }

  return <SplitWatchButton providers={providers} size={size} fullWidth={fullWidth} />;
}

function SplitWatchButton({ providers, size, fullWidth }: { providers: Offer[]; size: "sm" | "lg"; fullWidth?: boolean }) {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [caretHovered, setCaretHovered] = useState(false);
  const primary = providers[0];
  const rest = providers.slice(1);
  const color = getProviderColor(primary.provider_id);
  const label = monetizationLabel(primary.monetization_type);
  const isLg = size === "lg";

  return (
    <div className={`flex${fullWidth || isLg ? " w-full" : ""}`} style={{ minHeight: isLg ? "52px" : "32px" }}>
      {/* Primary provider link */}
      <a
        href={primary.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex-1 flex items-center justify-center gap-1.5 transition-colors duration-200 font-semibold ${
          isLg
            ? "rounded-l-xl px-6 py-3 text-base"
            : "rounded-l-lg px-3 py-1.5 text-xs"
        }`}
        style={{ backgroundColor: primaryHovered ? color.hover : color.bg, color: color.text }}
        onMouseEnter={() => setPrimaryHovered(true)}
        onMouseLeave={() => setPrimaryHovered(false)}
      >
        {label && <span className="opacity-75">{label}</span>}
        <img src={primary.provider_icon_url} alt={primary.provider_name} className="w-5 h-5 rounded" loading="lazy" />
        <ExternalLink size={14} className="opacity-60" />
      </a>

      {/* Caret / dropdown trigger */}
      <Popover.Root>
        <Popover.Trigger
          className={`flex items-center border-l border-white/20 transition-colors duration-200 cursor-pointer ${
            isLg ? "rounded-r-xl px-2.5" : "rounded-r-lg px-1.5"
          }`}
          style={{ backgroundColor: caretHovered ? color.hover : color.bg, color: color.text }}
          onMouseEnter={() => setCaretHovered(true)}
          onMouseLeave={() => setCaretHovered(false)}
          aria-label={`More streaming options (${rest.length} more)`}
        >
          <ChevronDown size={isLg ? 14 : 12} className="opacity-70" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
            <Popover.Popup className="bg-zinc-900 border border-white/[0.08] rounded-lg shadow-xl p-1 min-w-[160px]">
              {rest.map((o) => {
                const c = getProviderColor(o.provider_id);
                const lbl = monetizationLabel(o.monetization_type);
                return (
                  <a
                    key={o.provider_id}
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-800 transition-colors"
                  >
                    <div
                      className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: c.bg }}
                    >
                      <img src={o.provider_icon_url} alt={o.provider_name} className="w-5 h-5 rounded" loading="lazy" />
                    </div>
                    {lbl && (
                      <span className="text-xs font-semibold" style={{ color: c.text }}>
                        {lbl}
                      </span>
                    )}
                    <span className="text-xs text-zinc-300 flex-1 truncate">{o.provider_name}</span>
                    <ExternalLink size={11} className="text-zinc-600 flex-shrink-0" />
                  </a>
                );
              })}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
