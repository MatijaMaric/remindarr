import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface SettingsTabDef {
  value: string;
  label: string;
}

export function SettingsSidebar({
  tabs,
  active,
  onSelect,
  buildInfo,
}: {
  tabs: SettingsTabDef[];
  active: string;
  onSelect: (value: string) => void;
  buildInfo?: React.ReactNode;
}) {
  return (
    <>
      {/* Mobile: horizontal pill row */}
      <nav
        aria-label="Settings sections"
        className="flex sm:hidden gap-1.5 overflow-x-auto scrollbar-none pb-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              onClick={() => onSelect(tab.value)}
              className={cn(
                "shrink-0 px-3.5 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors cursor-pointer",
                isActive
                  ? "bg-amber-400 text-black"
                  : "bg-white/[0.04] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.08]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden sm:block">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 px-3.5 pb-2.5">
          Sections
        </div>
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-0.5"
        >
          {tabs.map((tab) => {
            const isActive = tab.value === active;
            return (
              <button
                key={tab.value}
                onClick={() => onSelect(tab.value)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-r-md text-left text-[14px] font-medium transition-colors cursor-pointer border-l-2",
                  isActive
                    ? "bg-amber-400/10 text-zinc-100 border-amber-400 font-semibold"
                    : "text-zinc-400 border-transparent hover:bg-white/[0.04] hover:text-zinc-100",
                )}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="font-mono text-[10px] text-amber-400/80"
                  >
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {buildInfo && (
          <Card padding="none" className="mt-6 p-3.5 rounded-[10px]">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">
              Build
            </div>
            <div className="font-mono text-xs text-zinc-300 leading-relaxed">
              {buildInfo}
            </div>
          </Card>
        )}
      </aside>
    </>
  );
}
