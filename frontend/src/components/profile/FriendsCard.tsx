import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { Avatar } from "./atoms/Avatar";
import type { ProfileFriend } from "../../types";

interface FriendsCardProps {
  friends: ProfileFriend[];
  profileUsername: string;
  totalFriends: number;
}

function formatSince(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

export default function FriendsCard({
  friends,
  profileUsername,
  totalFriends,
}: FriendsCardProps) {
  const { t } = useTranslation();
  if (friends.length === 0) return null;

  return (
    <DossierCard>
      <div className="flex items-baseline justify-between mb-3">
        <Kicker className="mb-0">
          {t("userProfile.dossier.friendsCount", { count: totalFriends })}
        </Kicker>
        <Link
          to={`/u/${profileUsername}/followers`}
          className="text-[11px] font-semibold text-primary-text hover:text-primary-text transition-colors"
        >
          {t("userProfile.dossier.seeAll")}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {friends.map((f) => (
          <Link
            key={f.id}
            to={`/u/${f.username}`}
            className="flex items-center gap-2.5 py-1 -mx-1 px-1 rounded-sm hover:bg-fill-subtle transition-colors"
          >
            <Avatar
              username={f.username}
              displayName={f.display_name}
              image={f.image}
              size={32}
              fontSize={11}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-foreground-secondary truncate">
                {f.display_name || f.username}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground truncate">
                {t("userProfile.dossier.followedSince", {
                  date: formatSince(f.since),
                })}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </DossierCard>
  );
}
