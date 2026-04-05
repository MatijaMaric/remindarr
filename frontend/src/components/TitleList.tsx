import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Title } from "../types";
import TitleCard from "./TitleCard";

/** Number of columns at each responsive breakpoint */
const BREAKPOINT_COLS = { base: 2, sm: 3, md: 4, lg: 5, xl: 6 };

/** Auto-virtualize when list exceeds this many items (4 rows × 6 cols at xl) */
const VIRTUAL_THRESHOLD = 24;

/** Estimated height (px) per virtual row, including bottom gap */
const estimateRowSize = () => 400;

function getColumnCount(containerWidth: number): number {
  if (containerWidth >= 1280) return BREAKPOINT_COLS.xl;
  if (containerWidth >= 1024) return BREAKPOINT_COLS.lg;
  if (containerWidth >= 768) return BREAKPOINT_COLS.md;
  if (containerWidth >= 640) return BREAKPOINT_COLS.sm;
  return BREAKPOINT_COLS.base;
}

interface Props {
  titles: Title[];
  onTrackToggle?: () => void;
  emptyMessage?: string;
  showVisibilityToggle?: boolean;
  onVisibilityToggle?: (titleId: string, isPublic: boolean) => void;
  hideTypeBadge?: boolean;
  showProgressBar?: boolean;
  showStatusPicker?: boolean;
  showNotificationPicker?: boolean;
  showTags?: boolean;
  /** Limit grid display to N rows. Uses the largest breakpoint column count to calculate the slice size. */
  maxRows?: number;
  /** Optional link shown when maxRows truncates the list */
  viewAllHref?: string;
  viewAllLabel?: string;
}

export default function TitleList({
  titles,
  onTrackToggle,
  emptyMessage = "No titles found",
  showVisibilityToggle,
  onVisibilityToggle,
  hideTypeBadge,
  showProgressBar,
  showStatusPicker,
  showNotificationPicker,
  showTags,
  maxRows,
  viewAllHref,
  viewAllLabel,
}: Props) {
  // Limit items to fill maxRows at the largest breakpoint (6 columns on xl)
  const maxItems = maxRows ? maxRows * BREAKPOINT_COLS.xl : undefined;
  const displayTitles = maxItems ? titles.slice(0, maxItems) : titles;
  const isTruncated = maxItems ? titles.length > maxItems : false;
  const shouldVirtualize = !maxRows && displayTitles.length > VIRTUAL_THRESHOLD;

  // Virtual scrolling — hooks must be called unconditionally
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(2);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Track container width to compute column count for row grouping
  useEffect(() => {
    if (!shouldVirtualize || !containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setColumnCount(getColumnCount(entry.contentRect.width));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [shouldVirtualize]);

  // Capture the container's document-relative offset once on mount (and on resize).
  // Uses state so we never read a ref during render, which would violate react-hooks/refs.
  useLayoutEffect(() => {
    if (!shouldVirtualize || !containerRef.current) return;
    const update = () => {
      if (!containerRef.current) return;
      setScrollMargin(containerRef.current.getBoundingClientRect().top + window.scrollY);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [shouldVirtualize]);

  // Group display titles into rows of columnCount
  const rows = useMemo(() => {
    if (!shouldVirtualize) return [] as Title[][];
    const result: Title[][] = [];
    for (let i = 0; i < displayTitles.length; i += columnCount) {
      result.push(displayTitles.slice(i, i + columnCount));
    }
    return result;
  }, [shouldVirtualize, displayTitles, columnCount]);

  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    estimateSize: estimateRowSize,
    overscan: 3,
    scrollMargin,
  });

  if (titles.length === 0) {
    return <div className="text-center py-12 text-zinc-500">{emptyMessage}</div>;
  }

  const cardProps = {
    onTrackToggle,
    showVisibilityToggle,
    onVisibilityToggle,
    hideTypeBadge,
    showProgressBar,
    showStatusPicker,
    showNotificationPicker,
    showTags,
  };

  return (
    <div>
      {shouldVirtualize ? (
        <div
          ref={containerRef}
          data-testid="virtual-list"
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                {(rows[virtualRow.index] ?? []).map((title) => (
                  <TitleCard key={title.id} title={title} {...cardProps} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          data-testid="title-grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          {displayTitles.map((title) => (
            <TitleCard key={title.id} title={title} {...cardProps} />
          ))}
        </div>
      )}
      {isTruncated && viewAllHref && (
        <div className="mt-3 text-center">
          <a
            href={viewAllHref}
            className="text-sm text-amber-500 hover:text-amber-400 transition-colors"
          >
            {viewAllLabel ?? "View all"}
          </a>
        </div>
      )}
    </div>
  );
}
