import { invalidateLibrary } from "../lib/invalidateLibrary";
import { Menu } from "@base-ui/react/menu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../components/ui/card";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { groupShowsByStatus } from "../lib/groupShows";
import { getEffectiveStatus, statusLabelKey } from "../lib/titleStatus";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useIsMobile } from "../hooks/useIsMobile";
import { PageHeader, Pill } from "../components/design";
import BackdateWatchedButton from "../components/BackdateWatchedButton";
import StatusPicker from "../components/StatusPicker";
import TagList from "../components/TagList";
import NotificationModePicker from "../components/NotificationModePicker";
import { Popover } from "@base-ui/react/popover";
import { StatsView, formatEta } from "./StatsPage";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "../components/ui/alert-dialog";

// Module-scope empty array so the empty-state TitleList sees a stable
// reference and React.memo can short-circuit re-renders.
const EMPTY_TITLES: Title[] = [];

function TrackedStatsBand({ titles }: { titles: Title[] }) {
  const { t } = useTranslation();
  const watching = titles.filter(
    (t) => getEffectiveStatus(t) === "watching",
  ).length;
  const completed = titles.filter(
    (t) => getEffectiveStatus(t) === "completed",
  ).length;
  const scored = titles.filter((t) => t.imdb_score || t.tmdb_score);
  const avgScore =
    scored.length > 0
      ? (
          scored.reduce(
            (sum, t) => sum + (t.imdb_score ?? t.tmdb_score ?? 0),
            0,
          ) / scored.length
        ).toFixed(1)
      : null;
  const stats = [
    {
      label: t("tracked.stats.watching"),
      value: String(watching),
      sub: t("tracked.stats.watchingSub", { count: titles.length }),
    },
    {
      label: t("status.completed"),
      value: String(completed),
      sub: t("tracked.stats.completedSub"),
    },
    {
      label: t("tracked.stats.avgScore"),
      value: avgScore ? `★ ${avgScore}` : "—",
      sub:
        scored.length > 0
          ? t("tracked.stats.avgScoreSub", { count: scored.length })
          : t("tracked.stats.noRatings"),
    },
    {
      label: t("tracked.stats.total"),
      value: String(titles.length),
      sub: t("tracked.stats.totalSub"),
    },
  ];
  return (
    <div className="hidden sm:grid grid-cols-4 gap-3 mb-6">
      {stats.map((s) => (
        <Card key={s.label} padding="none" className="p-3 lg:p-[18px] min-w-0">
          <div className="text-xs text-muted-foreground font-medium mb-2">
            {s.label}
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <div className="text-[30px] sm:text-[36px] font-extrabold tracking-[-0.03em] leading-none">
              {s.value}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {s.sub}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const STATUS_TABS = [
  { key: "all", labelKey: "tracked.tabs.all" },
  { key: "watching", labelKey: "status.watching" },
  { key: "completed", labelKey: "status.completed" },
  { key: "on_hold", labelKey: "status.onHold" },
  { key: "plan_to_watch", labelKey: "tracked.tabs.planning" },
  { key: "dropped", labelKey: "status.dropped" },
] as const;

type SortKey = "last_aired" | "title" | "rating" | "progress";

function sortTitles(titles: Title[], sort: SortKey): Title[] {
  return [...titles].sort((a, b) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title);
      case "rating":
        return (
          (b.imdb_score ?? b.tmdb_score ?? 0) -
          (a.imdb_score ?? a.tmdb_score ?? 0)
        );
      case "progress": {
        const pctA = a.total_episodes
          ? (a.watched_episodes_count ?? 0) / a.total_episodes
          : 0;
        const pctB = b.total_episodes
          ? (b.watched_episodes_count ?? 0) / b.total_episodes
          : 0;
        return pctB - pctA;
      }
      case "last_aired":
      default: {
        const dA = a.latest_released_air_date ?? a.tracked_at ?? "";
        const dB = b.latest_released_air_date ?? b.tracked_at ?? "";
        return dB.localeCompare(dA);
      }
    }
  });
}

export default function TrackedPage() {
  const qc = useQueryClient();
  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ["tracked"],
    queryFn: ({ signal }) => api.getTrackedTitles(signal),
  });
  const refetch = useCallback(() => {
    void invalidateLibrary(qc);
  }, [qc]);
  const allTitles: Title[] = useMemo(() => data?.titles ?? [], [data]);
  useScrollRestoration("tracked", !loading);
  const { t } = useTranslation();
  useGridNavigation();

  // Select mode state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectButtonRef = useRef<HTMLButtonElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter =
    STATUS_TABS.find((tab) => tab.key === searchParams.get("status"))?.key ??
    "all";
  const search = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const provider = searchParams.get("provider") ?? "";
  function setFilter(key: string, value: string) {
    setSelectedIds(new Set());
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  function resetFilters() {
    setSelectedIds(new Set());
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        for (const key of ["q", "tag", "provider", "status"]) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const hasFilters = !!(search || tag || provider || statusFilter !== "all");
  const requestedView = searchParams.get("view");
  const view =
    requestedView === "grid" || requestedView === "stats"
      ? requestedView
      : "list";
  function setView(nextView: "grid" | "list" | "stats") {
    setSearchParams((params) => {
      params.set("view", nextView);
      return params;
    });
  }
  const requestedSort = searchParams.get("sort");
  const sort: SortKey =
    requestedSort === "title" ||
    requestedSort === "rating" ||
    requestedSort === "progress"
      ? requestedSort
      : "last_aired";

  // URL navigation (including browser history) must also leave selection mode.
  if (selectMode && view !== "list") {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const matchingTitles = useMemo(
    () =>
      allTitles.filter(
        (title) =>
          title.title
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()) &&
          (!tag || title.tags?.includes(tag)) &&
          (!provider ||
            title.offers.some(
              (offer) => String(offer.provider_id) === provider,
            )),
      ),
    [allTitles, search, tag, provider],
  );
  const tags = [
    ...new Set(allTitles.flatMap((title) => title.tags ?? [])),
  ].sort();
  const providers = [
    ...new Map(
      allTitles.flatMap((title) =>
        title.offers.map(
          (offer) => [String(offer.provider_id), offer.provider_name] as const,
        ),
      ),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const { showGroups, movies } = useMemo(() => {
    const shows = matchingTitles.filter((t) => t.object_type === "SHOW");
    return {
      showGroups: groupShowsByStatus(shows).map((group) => ({
        ...group,
        titles: sortTitles(group.titles, sort),
      })),
      movies: sortTitles(
        matchingTitles.filter((t) => t.object_type === "MOVIE"),
        sort,
      ),
    };
  }, [matchingTitles, sort]);

  const filteredTitles = useMemo(() => {
    if (statusFilter === "all") return matchingTitles;
    return matchingTitles.filter((t) => getEffectiveStatus(t) === statusFilter);
  }, [matchingTitles, statusFilter]);

  const sortedFilteredTitles = useMemo(
    () => sortTitles(filteredTitles, sort),
    [filteredTitles, sort],
  );

  // Exit select mode and clear selection
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    selectButtonRef.current?.focus();
  }, []);

  // Toggle select mode
  const toggleSelectMode = useCallback(() => {
    if (selectMode) {
      exitSelectMode();
      return;
    }
    setSelectMode(true);
    setSelectedIds(new Set());
  }, [selectMode, exitSelectMode]);

  // Ctrl/Cmd+A selects all visible titles when in select mode
  useEffect(() => {
    if (!selectMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest(
            'input:not([type="checkbox"]), textarea, select, [contenteditable=true]',
          )
        )
          return;
        e.preventDefault();
        setSelectedIds(new Set(sortedFilteredTitles.map((t) => t.id)));
      }
      if (e.key === "Escape") {
        exitSelectMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectMode, sortedFilteredTitles, exitSelectMode]);

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={t("tracked.kicker", { count: allTitles.length })}
        title={t("tracked.heading")}
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <BackdateWatchedButton scope="all" variant="ghost" />
            {view === "list" && (
              <Pill
                ref={selectButtonRef}
                active={selectMode}
                onClick={toggleSelectMode}
              >
                {t("tracked.view.select")}
              </Pill>
            )}
            <Pill active={view === "grid"} onClick={() => setView("grid")}>
              {t("tracked.view.grid")}
            </Pill>
            <Pill active={view === "list"} onClick={() => setView("list")}>
              {t("tracked.view.list")}
            </Pill>
            <Pill active={view === "stats"} onClick={() => setView("stats")}>
              {t("tracked.view.stats")}
            </Pill>
          </div>
        }
      />

      {!loading && <TrackedStatsBand titles={allTitles} />}

      {view !== "stats" && allTitles.length > 0 && (
        <details
          className="rounded-md border border-border p-2"
          open={hasFilters || undefined}
        >
          <summary className="cursor-pointer min-h-8 text-sm font-medium">
            {t("tracked.filters.heading")}
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <input
              type="search"
              aria-label={t("tracked.filters.search")}
              placeholder={t("tracked.filters.search")}
              value={search}
              onChange={(event) => setFilter("q", event.target.value)}
              className="min-w-0 min-h-10 rounded-sm bg-muted px-3 text-sm"
            />
            <select
              aria-label={t("tracked.filters.tag")}
              value={tag}
              onChange={(event) => setFilter("tag", event.target.value)}
              className="min-w-0 min-h-10 rounded-sm bg-muted px-3 text-sm"
            >
              <option value="">{t("tracked.filters.allTags")}</option>
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label={t("tracked.filters.provider")}
              value={provider}
              onChange={(event) => setFilter("provider", event.target.value)}
              className="min-w-0 min-h-10 rounded-sm bg-muted px-3 text-sm"
            >
              <option value="">{t("tracked.filters.allProviders")}</option>
              {providers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-10 text-sm text-primary-text"
            >
              {t("tracked.filters.reset")}
            </button>
          )}
        </details>
      )}

      {view !== "stats" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-border mb-4">
          <div
            role="tablist"
            aria-label={t("tracked.filterTabs")}
            className="flex items-center gap-0 overflow-x-auto scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-1"
          >
            {STATUS_TABS.map((tab) => {
              const count =
                tab.key === "all"
                  ? matchingTitles.length
                  : matchingTitles.filter(
                      (t) => getEffectiveStatus(t) === tab.key,
                    ).length;
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`tracked-status-tab-${tab.key}`}
                  aria-selected={isActive}
                  aria-controls="tracked-status-panel"
                  onClick={() =>
                    setFilter("status", tab.key === "all" ? "" : tab.key)
                  }
                  className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    isActive
                      ? "text-foreground border-primary font-semibold"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  {t(tab.labelKey)}
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <select
            value={sort}
            onChange={(e) => setFilter("sort", e.target.value)}
            aria-label={t("tracked.sortBy")}
            className="self-end sm:self-auto font-mono text-[11px] bg-fill-subtle border border-border text-muted-foreground rounded-sm px-3 py-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card mb-2 sm:mb-0.5 shrink-0"
          >
            <option value="last_aired">{t("tracked.sort.lastAired")}</option>
            <option value="title">{t("tracked.sort.title")}</option>
            <option value="rating">{t("tracked.sort.rating")}</option>
            <option value="progress">{t("tracked.sort.progress")}</option>
          </select>
        </div>
      )}

      {view === "stats" ? (
        <StatsView />
      ) : (
        <div
          role="tabpanel"
          id="tracked-status-panel"
          aria-labelledby={`tracked-status-tab-${statusFilter}`}
        >
          {loading ? (
            <TitleGridSkeleton />
          ) : isError ? (
            <p className="text-muted-foreground text-sm py-12 text-center">
              {t("common.error")}
            </p>
          ) : filteredTitles.length === 0 && allTitles.length > 0 ? (
            <div className="py-8 text-center">
              <p>{t("tracked.filters.noMatches")}</p>
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 text-primary-text"
              >
                {t("tracked.filters.reset")}
              </button>
            </div>
          ) : filteredTitles.length === 0 ? (
            <TitleList
              titles={EMPTY_TITLES}
              onTrackToggle={refetch}
              emptyMessage={t("tracked.empty")}
            />
          ) : view === "list" ? (
            <TrackedTable
              titles={sortedFilteredTitles}
              onRefetch={refetch}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          ) : statusFilter !== "all" ? (
            <TitleList
              titles={sortedFilteredTitles}
              onTrackToggle={refetch}
              hideTypeBadge
              showProgressBar
              showStatusPicker
              showNotificationPicker
              showTags
            />
          ) : (
            <div className="space-y-6">
              {showGroups.map((group) => (
                <div key={group.key}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    {t(group.labelKey)} ({group.titles.length})
                  </h3>
                  <TitleList
                    titles={group.titles}
                    onTrackToggle={refetch}
                    hideTypeBadge
                    showProgressBar
                    showStatusPicker
                    showNotificationPicker
                    showTags
                  />
                </div>
              ))}
              {movies.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    {t("tracked.sections.movies")} ({movies.length})
                  </h3>
                  <TitleList
                    titles={movies}
                    onTrackToggle={refetch}
                    showStatusPicker
                    showNotificationPicker
                    showTags
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <BulkActionBar
          selectedIds={selectedIds}
          onDone={() => {
            exitSelectMode();
            refetch();
          }}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  watching: "#fbbf24",
  completed: "oklch(0.7 0.14 140)",
  on_hold: "oklch(0.7 0.12 60)",
  plan_to_watch: "oklch(0.72 0.1 240)",
  dropped: "oklch(0.65 0.12 0)",
};

function RowActionsMenu({
  title,
  onRefetch,
}: {
  title: Title;
  onRefetch: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t("tracked.row.moreActions", { title: title.title })}
        className="min-w-11 min-h-11 rounded-sm text-foreground-secondary hover:bg-muted"
      >
        ···
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50"
        >
          <Popover.Popup className="w-64 max-w-[calc(100vw-2rem)] rounded-md bg-card border border-border shadow-xl p-3 space-y-3">
            <Popover.Title className="font-semibold text-sm break-words">
              {title.title}
            </Popover.Title>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("tracked.columns.status")}
              </p>
              <StatusPicker
                titleId={title.id}
                objectType={title.object_type}
                currentStatus={title.user_status}
                onStatusChange={onRefetch}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("notifications.label")}
              </p>
              <NotificationModePicker
                titleId={title.id}
                currentMode={title.notification_mode ?? null}
                snoozeUntil={title.snooze_until}
                remindOnRelease={title.remind_on_release}
                releaseDate={title.release_date}
                onModeChange={onRefetch}
                onSnoozed={onRefetch}
                onRemindOnReleaseChange={onRefetch}
              />
            </div>
            <TagList
              titleId={title.id}
              tags={title.tags ?? []}
              onTagsChange={onRefetch}
            />
            {title.tmdb_url && (
              <a
                href={title.tmdb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm min-h-10"
              >
                {t("tracked.row.openTmdb")} ↗
              </a>
            )}
            <button
              type="button"
              className="text-sm text-destructive min-h-10"
              onClick={async () => {
                try {
                  await api.untrackTitle(title.id);
                  onRefetch();
                } catch {
                  toast.error(t("common.error"));
                }
              }}
            >
              {t("tracked.row.untrack")}
            </button>
            <Popover.Close className="block min-h-10 text-sm">
              {t("common.close")}
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface TrackedTableProps {
  titles: Title[];
  onRefetch: () => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

function TrackedTable({
  titles,
  onRefetch,
  selectMode = false,
  selectedIds = new Set(),
  onSelectionChange,
}: TrackedTableProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile("(max-width: 767px)");
  const statusText = (key: string | null) => {
    const labelKey = statusLabelKey(key);
    return labelKey ? t(labelKey) : (key ?? "—");
  };
  const allSelected =
    titles.length > 0 && titles.every((title) => selectedIds.has(title.id));
  const someSelected = titles.some((title) => selectedIds.has(title.id));
  const selectAll = (
    <input
      type="checkbox"
      aria-label={t("tracked.row.selectAll")}
      checked={allSelected}
      ref={(input) => {
        if (input) input.indeterminate = someSelected && !allSelected;
      }}
      onChange={(event) =>
        onSelectionChange?.(
          event.target.checked
            ? new Set(titles.map((title) => title.id))
            : new Set(),
        )
      }
      className="w-4 h-4 accent-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    />
  );

  function toggleId(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {selectMode && (
          <label className="flex items-center gap-3 px-3 py-2 text-sm text-foreground-secondary cursor-pointer">
            {selectAll}
            {t("tracked.row.selectAll")}
          </label>
        )}
        {titles.map((title) => {
          const statusKey = getEffectiveStatus(title);
          const statusColor = statusKey
            ? (STATUS_COLORS[statusKey] ?? STATUS_COLORS["plan_to_watch"])
            : "#71717a";
          const statusLabel = statusText(statusKey);
          const watched = title.watched_episodes_count ?? 0;
          const total =
            title.total_episodes ?? title.released_episodes_count ?? 0;
          const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
          const isSelected = selectedIds.has(title.id);

          const rowContent = (
            <>
              {selectMode && (
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    aria-label={t("tracked.row.select", { title: title.title })}
                    checked={isSelected}
                    onChange={() => toggleId(title.id)}
                    className="w-4 h-4 accent-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                </div>
              )}
              <div className="w-[48px] h-[68px] rounded-md overflow-hidden shrink-0 bg-muted">
                {title.poster_url && (
                  <img
                    src={title.poster_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: statusColor }}
                  />
                  <span className="text-[13px] font-semibold truncate">
                    {title.title}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground mb-1.5">
                  {title.offers[0]?.provider_name ?? ""}
                  {statusKey ? ` · ${statusLabel}` : ""}
                  {title.next_episode_air_date && statusKey !== "completed"
                    ? ` · ${new Date(title.next_episode_air_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : ""}
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[3px] bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: statusColor }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {watched}/{total}
                    </span>
                  </div>
                )}
                {title.eta_days != null && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {t("tracked.row.eta", { eta: formatEta(title.eta_days) })}
                  </span>
                )}
              </div>
            </>
          );

          if (selectMode) {
            return (
              <label
                key={title.id}
                className={`flex gap-3 items-center rounded-lg p-2.5 w-full text-left transition-colors ${isSelected ? "bg-primary-soft border border-primary-border" : "bg-card border border-border"}`}
              >
                {rowContent}
              </label>
            );
          }

          return (
            <div
              key={title.id}
              className="flex items-center gap-1 bg-card border border-border rounded-lg p-2.5"
            >
              <Link
                to={`/title/${title.id}`}
                aria-label={title.title}
                className="flex flex-1 min-w-0 gap-3 items-center"
              >
                {rowContent}
              </Link>
              <RowActionsMenu title={title} onRefetch={onRefetch} />
            </div>
          );
        })}
      </div>
    );
  }

  const Row = selectMode ? "label" : "div";
  return (
    <div>
      {/* Column header */}
      <div
        className="grid gap-4 px-4 py-2.5 text-xs text-muted-foreground"
        style={{
          gridTemplateColumns: selectMode
            ? "32px 38px minmax(0,1fr) 110px 140px 100px 75px 105px"
            : "38px minmax(0,1fr) 110px 140px 100px 75px 105px",
        }}
      >
        {selectMode && <div>{selectAll}</div>}
        <div />
        <div>{t("tracked.columns.show")}</div>
        <div>{t("tracked.columns.status")}</div>
        <div>{t("tracked.columns.progress")}</div>
        <div>{t("tracked.columns.next")}</div>
        <div>{t("tracked.columns.rating")}</div>
        <div className="text-right">{t("tracked.columns.actions")}</div>
      </div>
      {/* Rows */}
      <div className="rounded-lg border border-border divide-y divide-border">
        {titles.map((title) => {
          const statusKey = getEffectiveStatus(title);
          const statusColor = statusKey
            ? (STATUS_COLORS[statusKey] ?? STATUS_COLORS["plan_to_watch"])
            : "#71717a";
          const statusLabel = statusText(statusKey);
          const watched = title.watched_episodes_count ?? 0;
          const total =
            title.total_episodes ?? title.released_episodes_count ?? 0;
          const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
          const score = title.imdb_score ?? title.tmdb_score;
          const nextDate = title.next_episode_air_date
            ? new Date(title.next_episode_air_date).toLocaleDateString(
                undefined,
                {
                  month: "short",
                  day: "numeric",
                },
              )
            : null;
          const isSelected = selectedIds.has(title.id);

          return (
            <Row
              key={title.id}
              className={`grid gap-4 px-4 py-3 items-center transition-colors ${selectMode ? (isSelected ? "bg-primary-soft cursor-pointer" : "bg-card hover:bg-muted/60 cursor-pointer") : "bg-card hover:bg-muted/60"}`}
              style={{
                gridTemplateColumns: selectMode
                  ? "32px 38px minmax(0,1fr) 110px 140px 100px 75px 105px"
                  : "38px minmax(0,1fr) 110px 140px 100px 75px 105px",
              }}
            >
              {/* Checkbox column */}
              {selectMode && (
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={t("tracked.row.select", { title: title.title })}
                    checked={isSelected}
                    onChange={() => toggleId(title.id)}
                    className="w-4 h-4 accent-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                </div>
              )}
              {/* Poster thumbnail */}
              <div className="w-[38px] h-[56px] rounded-sm overflow-hidden shrink-0 bg-muted">
                {title.poster_url && (
                  <img
                    src={title.poster_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              {/* Title + meta */}
              <div>
                {selectMode ? (
                  <span className="text-sm font-semibold line-clamp-1">
                    {title.title}
                  </span>
                ) : (
                  <Link
                    to={`/title/${title.id}`}
                    className="text-sm font-semibold hover:text-primary-text transition-colors line-clamp-1"
                  >
                    {title.title}
                  </Link>
                )}
                <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                  {title.release_year}
                  {" · "}
                  {title.object_type === "SHOW"
                    ? t("tracked.row.show")
                    : t("tracked.row.movie")}
                  {title.offers[0] && ` · ${title.offers[0].provider_name}`}
                </div>
              </div>
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: statusColor }}
                />
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: statusColor }}
                >
                  {statusLabel}
                </span>
              </div>
              {/* Progress */}
              {total > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1 rounded-full bg-accent overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: statusColor }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {watched}/{total}
                    </span>
                  </div>
                  {title.eta_days != null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {t("tracked.row.eta", {
                        eta: formatEta(title.eta_days),
                      })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-muted-foreground">
                  —
                </div>
              )}
              {/* Next air date */}
              <div className="font-mono text-[12px] text-foreground-secondary">
                {nextDate ?? "—"}
              </div>
              {/* Rating */}
              <div
                className="font-mono text-[13px] font-semibold"
                style={{ color: score ? "#fbbf24" : "#52525b" }}
              >
                {score ? `★ ${score.toFixed(1)}` : "—"}
              </div>
              {/* Actions */}
              <div className="flex gap-1 justify-end">
                {!selectMode && (
                  <>
                    <Link
                      to={`/title/${title.id}`}
                      className="px-2.5 py-1 text-[11px] font-medium bg-accent border border-border rounded-sm text-foreground-secondary hover:text-foreground transition-colors"
                    >
                      {t("tracked.row.open")}
                    </Link>
                    <RowActionsMenu title={title} onRefetch={onRefetch} />
                  </>
                )}
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

const BULK_STATUS_OPTIONS = [
  { value: "watching", labelKey: "status.watching" },
  { value: "completed", labelKey: "status.completed" },
  { value: "on_hold", labelKey: "status.onHold" },
  { value: "plan_to_watch", labelKey: "status.planToWatch" },
  { value: "dropped", labelKey: "status.dropped" },
] as const;

interface BulkActionBarProps {
  selectedIds: Set<string>;
  onDone: () => void;
  onCancel: () => void;
}

function BulkActionBar({ selectedIds, onDone, onCancel }: BulkActionBarProps) {
  const { t } = useTranslation();
  const [confirmUntrack, setConfirmUntrack] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const count = selectedIds.size;

  async function runBulkAction(
    action: Parameters<typeof api.bulkTrackAction>[0],
  ) {
    setLoading(true);
    // Optimistic: get the selected ids for rollback reference
    const titleIds = action.titleIds;
    try {
      await api.bulkTrackAction(action);
      toast.success(t("tracked.bulk.updated", { count: titleIds.length }));
      onDone();
    } catch (err) {
      console.error("Bulk action failed", err);
      toast.error(t("tracked.bulk.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUntrack() {
    setConfirmUntrack(false);
    await runBulkAction({
      titleIds: Array.from(selectedIds),
      action: "untrack",
    });
  }

  async function handleSetStatus(status: string) {
    await runBulkAction({
      titleIds: Array.from(selectedIds),
      action: "set_status",
      payload: { status },
    });
  }

  async function handleAddTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    setTagOpen(false);
    setTagInput("");
    await runBulkAction({
      titleIds: Array.from(selectedIds),
      action: "add_tag",
      payload: { tag },
    });
  }

  async function handleMuteNotifications() {
    await runBulkAction({
      titleIds: Array.from(selectedIds),
      action: "set_notification_mode",
      payload: { mode: "none" },
    });
  }

  if (count === 0) {
    return (
      <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] md:bottom-4 left-0 right-0 z-30 flex justify-center pointer-events-none">
        <div className="mx-4 mb-4 max-w-xl w-full bg-card border border-border rounded-xl px-4 py-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t("tracked.bulk.hint")}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] md:bottom-4 left-0 right-0 z-30 flex justify-center">
        <div className="mx-4 mb-4 max-w-2xl w-full bg-card border border-border rounded-xl px-4 py-3 shadow-2xl">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] text-primary-text font-semibold shrink-0">
              {t("filter.selectedCount", { count })}
            </span>

            {/* Untrack */}
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                count > 10 ? setConfirmUntrack(true) : void handleUntrack()
              }
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-destructive-soft border border-destructive/30 text-destructive hover:bg-destructive-soft/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t("tracked.row.untrack")}
            </button>

            {/* Set Status */}
            <Menu.Root
              open={statusOpen}
              onOpenChange={(nextOpen) => {
                if (!nextOpen || !loading) setStatusOpen(nextOpen);
              }}
            >
              <Menu.Trigger
                aria-expanded={statusOpen}
                aria-disabled={loading}
                aria-busy={loading}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent border border-border text-foreground-secondary hover:text-foreground transition-colors cursor-pointer aria-disabled:opacity-50"
              >
                {t("tracked.bulk.setStatus")} ▾
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="z-50"
                >
                  <Menu.Popup className="min-w-[160px] bg-muted border border-border rounded-lg shadow-2xl py-1">
                    {BULK_STATUS_OPTIONS.map((opt) => (
                      <Menu.Item
                        key={opt.value}
                        onClick={() => void handleSetStatus(opt.value)}
                        className="w-full text-left px-3 py-2 text-xs text-foreground-secondary outline-none data-[highlighted]:bg-accent transition-colors cursor-pointer"
                      >
                        {t(opt.labelKey)}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            {/* Add Tag */}
            <div className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => setTagOpen((v) => !v)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent border border-border text-foreground-secondary hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                {t("tracked.bulk.addTag")}
              </button>
              {tagOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setTagOpen(false)}
                  />
                  <div className="absolute bottom-full mb-2 left-0 z-20 w-[220px] bg-muted border border-border rounded-lg shadow-2xl p-3">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddTag();
                          if (e.key === "Escape") setTagOpen(false);
                        }}
                        placeholder={t("tracked.bulk.tagPlaceholder")}
                        maxLength={30}
                        className="flex-1 bg-card border border-border rounded-sm px-2 py-1.5 text-xs text-foreground-secondary placeholder-foreground-disabled outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddTag()}
                        className="px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors cursor-pointer"
                      >
                        {t("tracked.bulk.add")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mute notifications */}
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleMuteNotifications()}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent border border-border text-foreground-secondary hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              {t("tracked.bulk.mute")}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm bulk untrack for large selections */}
      <AlertDialog open={confirmUntrack} onOpenChange={setConfirmUntrack}>
        <AlertDialogPopup>
          <AlertDialogTitle>
            {t("tracked.bulk.confirmTitle", { count })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("tracked.bulk.confirmDescription", { count })}
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogClose className="inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted-hover cursor-pointer transition-colors">
              {t("common.cancel")}
            </AlertDialogClose>
            <button
              onClick={() => void handleUntrack()}
              className="inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium bg-destructive-soft text-destructive hover:bg-destructive/20 cursor-pointer transition-colors"
            >
              {t("tracked.bulk.untrackAll")}
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
