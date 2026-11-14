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
      className="rounded-md border border-primary-border bg-primary-soft px-4 py-3 text-sm text-foreground-secondary"
    >
      <p className="font-semibold text-primary-text">
        {filtered
          ? t("advisory.banner.filtered", {
              cert: certification ?? t("advisory.unrated"),
            })
          : t("advisory.banner.allowed")}
      </p>
      <p className="mt-1 text-muted-foreground">
        {t("advisory.banner.notRemoved")}
      </p>
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-primary-text hover:text-primary-text cursor-pointer"
        onClick={() => void setAllowed(titleId, !allowlisted)}
      >
        {allowlisted
          ? t("advisory.banner.stopAlwaysShow")
          : t("advisory.banner.alwaysShow")}
      </button>
    </div>
  );
}
