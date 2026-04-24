import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { EditBioModal } from "./EditBioModal";

interface BioCardProps {
  bio: string | null;
  isOwnProfile: boolean;
  onBioUpdated?: (bio: string | null) => void;
}

export default function BioCard({ bio, isOwnProfile, onBioUpdated }: BioCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  const empty = !bio || bio.trim() === "";
  const placeholder = isOwnProfile
    ? t("userProfile.dossier.bioEmptyOwn")
    : t("userProfile.dossier.bioEmpty");

  return (
    <DossierCard>
      <div className="flex items-start justify-between">
        <Kicker color="zinc">{t("userProfile.dossier.bio")}</Kicker>
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-mt-1 p-1 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
            aria-label={t("userProfile.editProfile")}
            data-testid="bio-edit"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <div
        className={empty ? "text-sm text-zinc-500 italic leading-relaxed" : "text-sm text-zinc-200 leading-relaxed"}
        data-testid="bio-text"
      >
        {empty ? placeholder : bio}
      </div>
      {editing && (
        <EditBioModal
          initialValue={bio ?? ""}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onBioUpdated?.(next);
          }}
        />
      )}
    </DossierCard>
  );
}
