import { useTranslation } from "react-i18next";

/**
 * Unread recommendations pill. The number is decorative; screen readers get
 * the full sentence, which joins the accessible name of the enclosing link.
 */
export default function UnreadBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <>
      <span
        data-testid="unread-badge"
        aria-hidden="true"
        className={`min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-none ${className}`}
      >
        {count > 99 ? "99+" : count}
      </span>
      <span className="sr-only">
        {", "}
        {t("bottomNav.unreadRecommendations", { count })}
      </span>
    </>
  );
}
