import { useState, useRef, useMemo } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import type { Offer } from "../types";
import WatchButton, { monetizationLabel, PLEX_PROVIDER_ID, plexDeepLink, getPlexPlatform } from "./WatchButton";
import { getUniqueProviders } from "./EpisodeComponents";
import { getProviderColor } from "../data/providerColors";
import { useAuth } from "../context/AuthContext";

interface Props {
  offers: Offer[];
  variant?: "dropdown" | "inline";
  maxVisible?: number;
  size?: "sm" | "lg";
  fullWidth?: boolean;
}

export default function WatchButtonGroup({ offers, variant = "dropdown", maxVisible = 4, size = "sm", fullWidth }: Props) {
  const { subscriptions } = useAuth();
  const subscribedSet = useMemo(
    () => new Set(subscriptions?.providerIds ?? []),
    [subscriptions]
  );
  // Plex is treated as always subscribed — it's a self-hosted library, not a paid streaming service
  const isSubscribed = (providerId: number) =>
    providerId === PLEX_PROVIDER_ID || subscribedSet.has(providerId);

  const rawProviders = getUniqueProviders(offers);
  if (rawProviders.length === 0) return null;

  // Sort subscribed providers first; stable sort preserves relative order within each group
  const providers = subscribedSet.size > 0
    ? [...rawProviders].sort((a, b) => {
        const aS = isSubscribed(a.provider_id) ? 0 : 1;
        const bS = isSubscribed(b.provider_id) ? 0 : 1;
        return aS - bS;
      })
    : rawProviders;

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap gap-2">
        {providers.slice(0, maxVisible).map((o) => (
          <div
            key={o.provider_id}
            className={subscribedSet.size > 0 && !isSubscribed(o.provider_id) ? "opacity-50" : undefined}
          >
            <WatchButton
              url={o.url}
              providerId={o.provider_id}
              providerName={o.provider_name}
              providerIconUrl={o.provider_icon_url}
              monetizationType={o.monetization_type}
              variant="full"
            />
          </div>
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

  return <SplitWatchButton providers={providers} subscribedSet={subscribedSet} size={size} fullWidth={fullWidth} />;
}

function DropdownProviderItem({ offer, isLg, isSubscribed }: { offer: Offer; isLg: boolean; isSubscribed: boolean }) {
  const [hovered, setHovered] = useState(false);
  const c = getProviderColor(offer.provider_id);
  const lbl = monetizationLabel(offer.monetization_type);
  const platform = offer.provider_id === PLEX_PROVIDER_ID ? getPlexPlatform() : "desktop";
  const useMobileDeepLink = platform === "ios" || platform === "android";
  const effectiveUrl = useMobileDeepLink ? plexDeepLink(offer.url, platform) : offer.url;

  return (
    <a
      href={effectiveUrl}
      target={useMobileDeepLink ? undefined : "_blank"}
      rel="noopener noreferrer"
      aria-label={`Watch on ${offer.provider_name}${!isSubscribed ? " (not subscribed)" : ""}`}
      data-subscribed={isSubscribed}
      className={`flex items-center justify-center gap-1.5 font-semibold transition-colors duration-200 ${
        isLg ? "rounded-xl px-6 py-3 text-base" : "rounded-lg px-3 py-1.5 text-xs"
      }${!isSubscribed ? " opacity-50" : ""}`}
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

function SplitWatchButton({ providers, subscribedSet, size, fullWidth }: { providers: Offer[]; subscribedSet: Set<number>; size: "sm" | "lg"; fullWidth?: boolean }) {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [caretHovered, setCaretHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const primary = providers[0];
  const rest = providers.slice(1);
  const color = getProviderColor(primary.provider_id);
  const label = monetizationLabel(primary.monetization_type);
  const isLg = size === "lg";

  const platform = primary.provider_id === PLEX_PROVIDER_ID ? getPlexPlatform() : "desktop";
  const useMobileDeepLink = platform === "ios" || platform === "android";
  const primaryUrl = useMobileDeepLink ? plexDeepLink(primary.url, platform) : primary.url;

  return (
    <div ref={containerRef} className={`flex${fullWidth || isLg ? " w-full" : ""}`} style={{ minHeight: isLg ? "52px" : "32px" }}>
      {/* Primary provider link */}
      <a
        href={primaryUrl}
        target={useMobileDeepLink ? undefined : "_blank"}
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
          <Popover.Positioner
            anchor={containerRef}
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50"
            style={{ minWidth: "var(--anchor-width)" }}
          >
            <Popover.Popup className="flex flex-col gap-1 p-1">
              {rest.map((o) => (
                <DropdownProviderItem key={o.provider_id} offer={o} isLg={isLg} isSubscribed={subscribedSet.size === 0 || subscribedSet.has(o.provider_id) || o.provider_id === PLEX_PROVIDER_ID} />
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
