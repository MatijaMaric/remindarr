import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import FollowButton from "../FollowButton";
import { profileUrl } from "../../lib/tmdb-images";
import type { FollowedPerson } from "../../types";

interface FollowedPeopleCardProps {
  people: FollowedPerson[];
  isOwnProfile: boolean;
}

export default function FollowedPeopleCard({
  people,
  isOwnProfile,
}: FollowedPeopleCardProps) {
  const { t } = useTranslation();
  if (people.length === 0) return null;

  return (
    <DossierCard>
      <Kicker color="zinc" className="mb-3">
        {t("userProfile.dossier.followedPeople")}
      </Kicker>
      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Link
              to={`/person/${p.id}`}
              className="flex flex-1 min-w-0 items-center gap-2.5 py-1 -mx-1 px-1 rounded-md hover:bg-white/[0.03] transition-colors"
            >
              {p.profile_path ? (
                <img
                  src={profileUrl(p.profile_path, "w185") ?? ""}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover bg-zinc-800"
                  loading="lazy"
                  width={32}
                  height={32}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] text-zinc-300">
                  {p.name.charAt(0)}
                </div>
              )}
              <span className="text-[13px] font-semibold text-zinc-200 truncate">
                {p.name}
              </span>
            </Link>
            {isOwnProfile && (
              <FollowButton personId={p.id} initialIsFollowing />
            )}
          </li>
        ))}
      </ul>
    </DossierCard>
  );
}
