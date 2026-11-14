import { CheckCircle, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WatchedToggleButtonProps {
  watched: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  compactOnMobile?: boolean;
}

export default function WatchedToggleButton({
  watched,
  onClick,
  disabled = false,
  size = "sm",
  compactOnMobile = false,
}: WatchedToggleButtonProps) {
  const { t } = useTranslation();

  const iconSize = size === "sm" ? 12 : 14;

  const label = watched
    ? t("episodes.watched", "Watched")
    : size === "sm"
      ? t("episodes.watch", "Watch")
      : t("episodes.markWatchedShort", "Mark watched");

  if (disabled) {
    return (
      <span
        className={`inline-flex items-center flex-shrink-0 border cursor-not-allowed opacity-50 bg-muted/50 text-muted-foreground border-border ${
          size === "sm"
            ? "px-2 py-0.5 text-xs rounded-full gap-1"
            : compactOnMobile
              ? "px-1.5 sm:px-2.5 py-1 text-xs rounded-md gap-1.5"
              : "px-2.5 py-1 text-xs rounded-md gap-1.5"
        }`}
        aria-label={t("episodes.notYetReleased")}
        role="img"
      >
        <Circle size={iconSize} aria-hidden="true" />
        {compactOnMobile ? (
          <span className="hidden sm:inline">{label}</span>
        ) : (
          label
        )}
      </span>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={watched}
      aria-label={
        watched ? t("episodes.markAsUnwatched") : t("episodes.markAsWatched")
      }
      className={`inline-flex items-center flex-shrink-0 border cursor-pointer transition-colors ${
        watched
          ? "bg-success/15 text-success border-success/30 hover:bg-muted hover:text-muted-foreground hover:border-border"
          : "bg-muted text-muted-foreground border-border hover:bg-success/15 hover:text-success hover:border-success/30"
      } ${
        size === "sm"
          ? "px-2 py-0.5 text-xs rounded-full gap-1"
          : compactOnMobile
            ? "px-1.5 sm:px-2.5 py-1 text-xs rounded-md gap-1.5"
            : "px-2.5 py-1 text-xs rounded-md gap-1.5"
      }`}
    >
      {watched ? (
        <CheckCircle size={iconSize} aria-hidden="true" />
      ) : (
        <Circle size={iconSize} aria-hidden="true" />
      )}
      {compactOnMobile ? (
        <span className="hidden sm:inline">{label}</span>
      ) : (
        label
      )}
    </button>
  );
}
