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

function DropdownProviderItem({ offer, isLg }: { offer: Offer; isLg: boolean }) {
  const [hovered, setHovered] = useState(false);
  const c = getProviderColor(offer.provider_id);
  const lbl = monetizationLabel(offer.monetization_type);

  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-1.5 font-semibold transition-colors duration-200 ${
        isLg ? "rounded-xl px-6 py-3 text-base" : "rounded-lg px-3 py-1.5 text-xs"
      }`}
      style={{ backgroundColor: hovered ? c.bg : c.hover, color: c.text }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {lbl && <span className="opacity-75">{lbl}</span>}
      <img src={offer.provider_icon_url} alt={offer.provider_name} className="w-5 h-5 rounded" loading="lazy" />
      <ExternalLink size={14} className="opacity-60" />
    </a>
  );
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
            <Popover.Popup className="flex flex-col gap-1 p-1">
              {rest.map((o) => (
                <DropdownProviderItem key={o.provider_id} offer={o} isLg={isLg} />
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
