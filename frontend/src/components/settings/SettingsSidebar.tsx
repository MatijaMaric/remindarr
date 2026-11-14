import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <>
      {/* Mobile: horizontal pill row */}
      <nav
        role="tablist"
        aria-label={t("settings.sectionsLabel")}
        className="flex lg:hidden gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-w-0 w-full"
      >
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.value)}
              className={cn(
                "shrink-0 px-3.5 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors cursor-pointer",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-fill-subtle text-foreground-secondary border border-border hover:bg-accent",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden lg:block">
        <div className="text-xs font-medium text-muted-foreground px-3.5 pb-2.5">
          {t("settings.sections")}
        </div>
        <nav
          role="tablist"
          aria-label={t("settings.sectionsLabel")}
          className="flex flex-col gap-0.5"
        >
          {tabs.map((tab) => {
            const isActive = tab.value === active;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(tab.value)}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-r-sm text-left text-[14px] font-medium transition-colors cursor-pointer border-l-2",
                  isActive
                    ? "bg-primary-soft text-foreground border-primary font-semibold"
                    : "text-muted-foreground border-transparent hover:bg-fill-subtle hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="font-mono text-[11px] text-primary-text/80"
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
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Build
            </div>
            <div className="font-mono text-xs text-foreground-secondary leading-relaxed">
              {buildInfo}
            </div>
          </Card>
        )}
      </aside>
    </>
  );
}
