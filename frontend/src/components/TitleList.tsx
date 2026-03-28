import type { Title } from "../types";
import TitleCard from "./TitleCard";

/** Number of columns at each responsive breakpoint */
const BREAKPOINT_COLS = { base: 2, sm: 3, md: 4, lg: 5, xl: 6 };

interface Props {
  titles: Title[];
  onTrackToggle?: () => void;
  emptyMessage?: string;
  showVisibilityToggle?: boolean;
  onVisibilityToggle?: (titleId: string, isPublic: boolean) => void;
  hideTypeBadge?: boolean;
  showProgressBar?: boolean;
  /** Limit grid display to N rows. Uses the largest breakpoint column count to calculate the slice size. */
  maxRows?: number;
  /** Optional link shown when maxRows truncates the list */
  viewAllHref?: string;
  viewAllLabel?: string;
}

export default function TitleList({ titles, onTrackToggle, emptyMessage = "No titles found", showVisibilityToggle, onVisibilityToggle, hideTypeBadge, showProgressBar, maxRows, viewAllHref, viewAllLabel }: Props) {
  if (titles.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  // Limit items to fill maxRows at the largest breakpoint (6 columns on xl)
  const maxItems = maxRows ? maxRows * BREAKPOINT_COLS.xl : undefined;
  const displayTitles = maxItems ? titles.slice(0, maxItems) : titles;
  const isTruncated = maxItems ? titles.length > maxItems : false;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {displayTitles.map((title) => (
          <TitleCard key={title.id} title={title} onTrackToggle={onTrackToggle} showVisibilityToggle={showVisibilityToggle} onVisibilityToggle={onVisibilityToggle} hideTypeBadge={hideTypeBadge} showProgressBar={showProgressBar} />
        ))}
      </div>
      {isTruncated && viewAllHref && (
        <div className="mt-3 text-center">
          <a href={viewAllHref} className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
            {viewAllLabel ?? "View all"}
          </a>
        </div>
      )}
    </div>
  );
}
