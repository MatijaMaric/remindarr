import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

export type MediaCardAspect = "video" | "poster";

export interface MediaCardBadgeProps {
  label: ReactNode;
  tone?: "neutral" | "accent";
  position?: "top-left" | "top-right";
}

export function MediaCardBadge({
  label,
  tone = "neutral",
  position = "top-right",
}: MediaCardBadgeProps) {
  return (
    <span
      className={cn(
        "absolute top-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold leading-none select-none",
        position === "top-left" ? "left-2" : "right-2",
        tone === "accent"
          ? "bg-amber-400 text-zinc-950"
          : "bg-black/75 backdrop-blur-sm text-zinc-100",
      )}
    >
      {label}
    </span>
  );
}

export interface MediaCardProps {
  to: string;
  imageUrl: string | null;
  imageAlt: string;
  aspect: MediaCardAspect;

  badge?: MediaCardBadgeProps;
  unread?: boolean;
  overlayAction?: ReactNode;
  progressPercent?: number;

  title?: ReactNode;
  titleTo?: string;
  titleClamp?: 1 | 2;
  subtitle?: ReactNode;
  subtitleTo?: string;
  meta?: ReactNode;
  footer?: ReactNode;

  hoverZoom?: boolean;
  className?: string;
}

export function MediaCard({
  to,
  imageUrl,
  imageAlt,
  aspect,
  badge,
  unread,
  overlayAction,
  progressPercent,
  title,
  titleTo,
  titleClamp = 1,
  subtitle,
  subtitleTo,
  meta,
  footer,
  hoverZoom = true,
  className,
}: MediaCardProps) {
  const hasBody =
    title != null || subtitle != null || meta != null || footer != null;

  return (
    <Card
      padding="none"
      radius="xl"
      tone="solid"
      border="subtle"
      className={cn(
        "group/mediacard flex h-full w-full flex-col overflow-hidden",
        className,
      )}
    >
      {/* Media image */}
      <Link to={to} className="relative block">
        <div
          className={cn(
            "relative w-full overflow-hidden bg-zinc-800",
            aspect === "video" ? "aspect-video" : "aspect-[2/3]",
          )}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              loading="lazy"
              className={cn(
                "h-full w-full object-cover",
                hoverZoom &&
                  "transition-transform duration-300 group-hover/mediacard:scale-105",
              )}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-zinc-800 to-zinc-950" />
          )}

          {unread && (
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-amber-500/60" />
          )}

          {progressPercent != null && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/40">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {badge && <MediaCardBadge {...badge} />}

        {unread && !badge && (
          <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />
        )}

        {overlayAction && (
          <div className="absolute right-1.5 top-1.5">{overlayAction}</div>
        )}
      </Link>

      {hasBody && (
        <div className="flex flex-1 flex-col p-3">
          {title != null && (
            <Link
              to={titleTo ?? to}
              className="block text-white transition-colors hover:text-amber-400 group-hover/mediacard:text-amber-400"
            >
              <h3
                className={cn(
                  "text-sm font-semibold",
                  titleClamp === 2 ? "line-clamp-2" : "truncate",
                )}
              >
                {title}
              </h3>
            </Link>
          )}

          {subtitle != null &&
            (subtitleTo ? (
              <Link
                to={subtitleTo}
                className="block transition-colors hover:text-amber-400"
              >
                <div className="mt-0.5 text-xs">{subtitle}</div>
              </Link>
            ) : (
              <div className="mt-0.5 text-xs">{subtitle}</div>
            ))}

          {meta != null && (
            <div className="mt-1.5 text-xs text-zinc-500">{meta}</div>
          )}

          {footer != null && <div className="mt-auto pt-3">{footer}</div>}
        </div>
      )}
    </Card>
  );
}
