import { useTranslation } from "react-i18next";
import { useContentAdvisory } from "../hooks/useContentAdvisory";

export default function ContentAdvisoryBanner({
  titleId,
  certification,
}: {
  titleId: string;
  certification: string | null;
}) {
  const { t } = useTranslation();
  const { settings, actionFor, setAllowed } = useContentAdvisory();
  const action = actionFor(certification, titleId);
  const allowlisted = settings.allowlist.includes(titleId);

  if (settings.level === "none") return null;
  if (action === "show" && !allowlisted) return null;

  const filtered = action === "hide" || action === "blur";

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-zinc-200"
    >
      <p className="font-semibold text-amber-400">
        {filtered
          ? t("advisory.banner.filtered", {
              cert: certification ?? t("advisory.unrated"),
            })
          : t("advisory.banner.allowed")}
      </p>
      <p className="mt-1 text-zinc-400">{t("advisory.banner.notRemoved")}</p>
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
        onClick={() => void setAllowed(titleId, !allowlisted)}
      >
        {allowlisted
          ? t("advisory.banner.stopAlwaysShow")
          : t("advisory.banner.alwaysShow")}
      </button>
    </div>
  );
}
