import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type { HomepageSection } from "../../types";
import { DEFAULT_HOMEPAGE_LAYOUT } from "../../types";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import ThemePicker from "../../components/ThemePicker";
import { SCard } from "../../components/settings/kit";
import { cn } from "@/lib/utils";

const DEFAULT_CROWDED_WEEK_THRESHOLD = 5;

const SECTION_LABELS: Record<string, string> = {
  up_next: "settings.homepage.sections.up_next",
  unwatched: "settings.homepage.sections.unwatched",
  recommendations: "settings.homepage.sections.recommendations",
  today: "settings.homepage.sections.today",
  upcoming: "settings.homepage.sections.upcoming",
  airing_soon: "settings.homepage.sections.airing_soon",
};

function ThemeSection() {
  const { t } = useTranslation();

  return (
    <SCard
      title={t("settings.theme.title")}
      subtitle="Applies to the whole app."
    >
      <ThemePicker />
    </SCard>
  );
}

function HomepageLayoutSection() {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<HomepageSection[]>(DEFAULT_HOMEPAGE_LAYOUT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getHomepageLayout(controller.signal)
      .then((res) => { if (!controller.signal.aborted) setLayout(res.homepage_layout); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function save(newLayout: HomepageSection[]) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.updateHomepageLayout(newLayout);
      setLayout(res.homepage_layout);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently ignore
    } finally {
      setSaving(false);
    }
  }

  function toggleEnabled(id: string) {
    const updated = layout.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setLayout(updated);
    save(updated);
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const updated = [...layout];
    const [moved] = updated.splice(from, 1);
    updated.splice(index, 0, moved);
    dragIndexRef.current = index;
    setLayout(updated);
  }

  function handleDrop() {
    dragIndexRef.current = null;
    save(layout);
  }

  return (
    <SCard
      title={t("settings.homepage.title")}
      subtitle={t("settings.homepage.description")}
    >
      <div className="flex flex-col gap-1.5">
        {layout.map((section, index) => (
          <div
            key={section.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            className={cn(
              "flex items-center gap-3 px-3.5 py-3 rounded-[10px] cursor-grab active:cursor-grabbing select-none border transition-colors",
              section.enabled
                ? "bg-zinc-800 border-transparent"
                : "bg-transparent border-white/[0.06] opacity-60",
            )}
          >
            <GripVertical
              size={16}
              className="text-zinc-500 shrink-0"
              aria-hidden="true"
            />
            <span
              aria-hidden="true"
              className="w-6 h-6 rounded-md bg-zinc-700 text-amber-400 font-mono font-bold text-[10px] flex items-center justify-center"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-sm font-semibold text-zinc-100">
              {t(SECTION_LABELS[section.id] ?? section.id)}
            </span>
            <button
              onClick={() => toggleEnabled(section.id)}
              className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer p-1"
              aria-label={section.enabled ? t("settings.homepage.hideSection") : t("settings.homepage.showSection")}
            >
              {section.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 min-h-[18px] font-mono text-[11px]">
        {saved && <span className="text-emerald-400">{t("settings.homepage.saved")}</span>}
        {saving && !saved && <span className="text-zinc-400">{t("settings.homepage.saving")}</span>}
      </div>
    </SCard>
  );
}

function CrowdedWeekSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(DEFAULT_CROWDED_WEEK_THRESHOLD);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.getCrowdedWeekSettings(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setEnabled(res.crowdedWeekBadgeEnabled !== 0);
          setThreshold(res.crowdedWeekThreshold);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function save(updates: { crowdedWeekBadgeEnabled?: number; crowdedWeekThreshold?: number }) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.updateCrowdedWeekSettings(updates);
      setEnabled(res.crowdedWeekBadgeEnabled !== 0);
      setThreshold(res.crowdedWeekThreshold);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently ignore
    } finally {
      setSaving(false);
    }
  }

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    save({ crowdedWeekBadgeEnabled: next ? 1 : 0 });
  }

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1 || val > 20) return;
    setThreshold(val);
  }

  function handleThresholdBlur() {
    save({ crowdedWeekThreshold: threshold });
  }

  return (
    <SCard
      title={t("settings.crowdedWeek.title")}
      subtitle={t("settings.crowdedWeek.description")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200">
            {t("settings.crowdedWeek.enableLabel")}
          </span>
          <button
            onClick={handleToggle}
            aria-pressed={enabled}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
              enabled ? "bg-amber-500" : "bg-zinc-700"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                enabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {enabled && (
          <div className="flex items-center justify-between">
            <label htmlFor="crowded-week-threshold" className="text-sm font-medium text-zinc-200">
              {t("settings.crowdedWeek.thresholdLabel")}
            </label>
            <input
              id="crowded-week-threshold"
              type="number"
              min={1}
              max={20}
              value={threshold}
              onChange={handleThresholdChange}
              onBlur={handleThresholdBlur}
              className="w-20 rounded-md bg-zinc-800 border border-white/[0.08] text-white text-sm px-3 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}
      </div>
      <div className="mt-3 min-h-[18px] font-mono text-[11px]">
        {saved && <span className="text-emerald-400">{t("settings.crowdedWeek.saved")}</span>}
        {saving && !saved && <span className="text-zinc-400">{t("settings.crowdedWeek.saving")}</span>}
      </div>
    </SCard>
  );
}

export default function AppearanceTab() {
  return (
    <>
      <ThemeSection />
      <HomepageLayoutSection />
      <CrowdedWeekSection />
    </>
  );
}
