import type { Title, WatchProviderCountry } from "../../types";
import { PLEX_PROVIDER_ID, getPlexPlatform, plexDeepLink } from "../WatchButton";
import { getProviderColor } from "../../data/providerColors";
import { Section } from "./Section";
import { MONETIZATION_ORDER, TMDB_IMG, type MonetizationType } from "./utils";

function OfferChip({ offer }: { offer: Title["offers"][number] }) {
  const color = getProviderColor(offer.provider_id);
  const isPlex = offer.provider_id === PLEX_PROVIDER_ID;
  const platform = isPlex ? getPlexPlatform() : "desktop";
  const useMobileDeepLink = platform === "ios" || platform === "android";
  const url = useMobileDeepLink ? plexDeepLink(offer.url, platform) : offer.url;
  return (
    <a
      href={url}
      target={useMobileDeepLink ? undefined : "_blank"}
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:opacity-90 transition-opacity"
      style={{ backgroundColor: `${color.bg}20`, borderLeft: `3px solid ${color.bg}` }}
      title={offer.provider_name}
    >
      <img
        src={offer.provider_icon_url}
        alt={offer.provider_name}
        className="w-6 h-6 rounded"
        loading="lazy"
      />
      <span className="text-sm text-zinc-300">{offer.provider_name}</span>
    </a>
  );
}

function TmdbProviderChip({
  provider,
  watchLink,
}: {
  provider: { logo_path: string; provider_name: string; provider_id: number };
  watchLink?: string;
}) {
  const color = getProviderColor(provider.provider_id);
  const chip = (
    <div
      className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5"
      style={{ backgroundColor: `${color.bg}20`, borderLeft: `3px solid ${color.bg}` }}
    >
      <img
        src={`${TMDB_IMG}/w45${provider.logo_path}`}
        alt={provider.provider_name}
        className="w-6 h-6 rounded"
      />
      <span className="text-sm text-zinc-300">{provider.provider_name}</span>
    </div>
  );
  if (watchLink) {
    return (
      <a href={watchLink} target="_blank" rel="noopener noreferrer" className="hover:opacity-90 transition-opacity">
        {chip}
      </a>
    );
  }
  return chip;
}

function ProviderRow({
  label,
  children,
  isEmpty,
}: {
  label: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="w-[70px] shrink-0 pt-1.5 text-sm text-zinc-400">{label}</div>
      <div className="flex flex-wrap gap-2 items-center min-h-8">
        {isEmpty ? <span className="text-xs text-zinc-600 italic">— not available</span> : children}
      </div>
    </div>
  );
}

export function groupOffersByType(offers: Title["offers"]) {
  const groups: { type: string; label: string; offers: Title["offers"] }[] = [];
  for (const { type, label } of MONETIZATION_ORDER) {
    const deduped = new Map<number, Title["offers"][0]>();
    for (const o of offers) {
      if (o.monetization_type === type && !deduped.has(o.provider_id)) {
        deduped.set(o.provider_id, o);
      }
    }
    if (deduped.size > 0) {
      groups.push({ type, label, offers: Array.from(deduped.values()) });
    }
  }
  return groups;
}

export interface ProvidersSectionProps {
  offers: Title["offers"];
  watchProviders: WatchProviderCountry | undefined;
  watchLink: string | undefined;
}

export default function ProvidersSection({ offers, watchProviders, watchLink }: ProvidersSectionProps) {
  const offerGroups = groupOffersByType(offers);
  const hasOffers = offerGroups.length > 0;
  const hasProviders = !!watchProviders;
  if (!hasOffers && !hasProviders) return null;

  const providerMap: Record<MonetizationType, "flatrate" | "free" | "ads" | "rent" | "buy"> = {
    FLATRATE: "flatrate",
    FREE: "free",
    ADS: "ads",
    RENT: "rent",
    BUY: "buy",
  };

  return (
    <Section title="Where to Watch">
      <div className="flex flex-col gap-3 max-w-4xl">
        {MONETIZATION_ORDER.map(({ type, label }) => {
          const groupOffers = hasOffers ? (offerGroups.find((g) => g.type === type)?.offers ?? []) : [];
          const tmdbKey = providerMap[type];
          const tmdbProviders =
            !hasOffers && hasProviders && watchProviders ? (watchProviders[tmdbKey] ?? []) : [];
          const isEmpty = groupOffers.length === 0 && tmdbProviders.length === 0;
          return (
            <ProviderRow key={type} label={label} isEmpty={isEmpty}>
              {groupOffers.map((offer) => (
                <OfferChip key={offer.id} offer={offer} />
              ))}
              {tmdbProviders.map((p) => (
                <TmdbProviderChip key={p.provider_id} provider={p} watchLink={watchLink} />
              ))}
            </ProviderRow>
          );
        })}
      </div>
    </Section>
  );
}
