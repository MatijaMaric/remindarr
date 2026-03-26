import { Skeleton } from "./ui/skeleton";

/** Single title card skeleton matching TitleCard layout */
export function TitleCardSkeleton() {
  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col">
      {/* Poster */}
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      {/* Title + meta */}
      <div className="p-2 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Grid of title card skeletons */
export function TitleGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <TitleCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Single episode row skeleton */
function EpisodeRowSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`bg-zinc-900 rounded-xl ${compact ? "p-3" : "p-4"}`}>
      <div className="flex gap-4">
        <Skeleton className="w-16 h-24 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
          <div className="space-y-1 mt-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Episode list skeleton for HomePage / UpcomingPage */
export function EpisodeListSkeleton() {
  return (
    <div className="space-y-8">
      {/* Section heading */}
      <section>
        <Skeleton className="h-6 w-16 mb-4" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <EpisodeRowSkeleton key={i} />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-32 mb-2" />
              <div className="space-y-2">
                <EpisodeRowSkeleton compact />
                <EpisodeRowSkeleton compact />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Detail page hero skeleton (TitleDetailPage, SeasonDetailPage, EpisodeDetailPage, PersonPage) */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-8 pb-12">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48" />
      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-6">
        <Skeleton className="w-40 aspect-[2/3] rounded-xl mx-auto sm:mx-0 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      {/* Episodes / cast section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 bg-zinc-900 rounded-xl p-3">
              <Skeleton className="w-36 aspect-video rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Calendar / agenda list skeleton */
export function CalendarSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-8 w-full rounded-none mb-1" />
          <div className="space-y-1 px-2 py-1">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/60">
                <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                <Skeleton className="w-12 h-8 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grid calendar skeleton with poster placeholder cells */
export function GridCalendarSkeleton() {
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 bg-zinc-900 border-b border-white/[0.06]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-medium text-zinc-500 uppercase">
            {d}
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-white/[0.06] last:border-b-0">
          {Array.from({ length: 7 }).map((_, di) => (
            <div key={di} className="min-h-28 p-1.5 border-r border-white/[0.06] last:border-r-0">
              <Skeleton className="h-4 w-4 rounded-full mb-1.5" />
              {di % 3 === 0 && (
                <div className="flex gap-0.5">
                  <Skeleton className="w-7 h-[42px] rounded-sm" />
                  <Skeleton className="w-7 h-[42px] rounded-sm" />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Reels page skeleton (full-height card) */
export function ReelsSkeleton() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "calc(100dvh - 5rem)" }}
    >
      <div className="w-full max-w-sm space-y-4 px-4">
        <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
        <Skeleton className="h-5 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
      </div>
    </div>
  );
}
