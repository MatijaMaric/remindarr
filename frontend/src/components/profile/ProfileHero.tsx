import { Settings, Share2 } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import FollowButton from "../FollowButton";
import { Avatar } from "./atoms/Avatar";
import type { ProfileBackdrop, UserProfileUser } from "../../types";

interface ProfileHeroProps {
  user: UserProfileUser;
  backdrops: ProfileBackdrop[];
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  onFollowToggle?: (isFollowing: boolean) => void;
}

function MemberSinceKicker({ memberSince }: { memberSince: string | null }) {
  const { t } = useTranslation();
  if (!memberSince) return null;
  const formatted = new Date(memberSince).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  return (
    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400 mb-2.5">
      {t("userProfile.memberSinceKicker", { date: formatted })}
    </div>
  );
}

export default function ProfileHero({
  user,
  backdrops,
  followerCount,
  followingCount,
  isFollowing,
  isOwnProfile,
  onFollowToggle,
}: ProfileHeroProps) {
  const { t } = useTranslation();
  const displayName = user.display_name || user.username;

  function countryFlag(code: string): string {
    const offset = 0x1F1E6 - 65;
    return Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(c.charCodeAt(0) + offset)).join("");
  }

  async function handleShare() {
    const shareUrl = window.location.href;
    const payload = {
      title: `${displayName} · Remindarr`,
      text: `Check out @${user.username}'s watchlist on Remindarr`,
      url: shareUrl,
    };
    if (typeof navigator !== "undefined" && "share" in navigator && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  const filmstripSlots = backdrops.slice(0, 5);

  return (
    <div
      className="w-[100vw] relative left-[50%] ml-[-50vw] overflow-hidden dark-section"
      style={{ height: 360 }}
      data-testid="profile-hero"
    >
      {/* Filmstrip */}
      {filmstripSlots.length > 0 ? (
        <div className="absolute inset-0 flex gap-0.5" aria-hidden="true">
          {filmstripSlots.map((b, i) => {
            const isCenter = i === 2;
            const fadeFromCenter = Math.abs(i - 2);
            const opacity = Math.max(0.55, 0.9 - fadeFromCenter * 0.08);
            return (
              <div
                key={b.id}
                className="relative overflow-hidden"
                style={{ flex: isCenter ? 1.4 : 1, opacity }}
              >
                <img
                  src={b.backdrop_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950"
          data-testid="fallback-bg"
        />
      )}

      {/* Gradient overlays for legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.8) 60%, rgba(9,9,11,1) 100%), linear-gradient(90deg, rgba(9,9,11,0.4) 0%, transparent 40%, transparent 60%, rgba(9,9,11,0.4) 100%)",
        }}
      />

      {/* Top-right overlay */}
      <div className="absolute top-5 right-6 z-20 flex items-center gap-2">
        {isOwnProfile && (
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-amber-400 transition-colors"
            data-testid="settings-link"
          >
            <Settings className="size-3.5" />
            {t("userProfile.editProfile")}
          </Link>
        )}
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
          data-testid="share-link"
        >
          <Share2 className="size-3.5" />
          {t("userProfile.share")}
        </button>
      </div>

      {/* Identity overlay bottom */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 pb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="flex items-end gap-5 min-w-0">
            <Avatar
              username={user.username}
              displayName={user.display_name}
              image={user.image}
              size={104}
              fontSize={40}
              className="shadow-xl"
            />
            <div className="min-w-0">
              <MemberSinceKicker memberSince={user.member_since} />
              <h1
                className="text-white font-extrabold leading-none truncate"
                style={{
                  fontSize: "clamp(32px, 5vw, 56px)",
                  letterSpacing: "-0.032em",
                  textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
              >
                {displayName}
              </h1>
              <div className="mt-2 font-mono text-[13px] text-zinc-300 flex items-center gap-2">
                @{user.username}
                {user.country_code && (
                  <span title={user.country_code} aria-label={user.country_code}>
                    {countryFlag(user.country_code)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="flex gap-5 px-4 py-2.5 rounded-xl bg-black/55 backdrop-blur-md border border-white/[0.08]"
              data-testid="social-bar"
            >
              <div className="text-center">
                <div className="text-[18px] font-extrabold text-white leading-tight">
                  {followerCount}
                </div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                  {t("userProfile.followers")}
                </div>
              </div>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <div className="text-[18px] font-extrabold text-white leading-tight">
                  {followingCount}
                </div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                  {t("userProfile.following")}
                </div>
              </div>
            </div>
            {!isOwnProfile && (
              <FollowButton
                userId={user.id}
                initialIsFollowing={isFollowing}
                onToggle={onFollowToggle}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
