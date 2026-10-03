import {
  SaveFeedback,
  useSettingsSave,
} from "../../components/settings/SaveFeedback";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../api";
import type {
  HomepageSection,
  AppearanceSettings,
  AccentColor,
  Density,
} from "../../types";
import { ADVISORY_LEVELS } from "../../lib/contentAdvisory";
import { ADVISORY_QUERY_KEY } from "../../hooks/useContentAdvisory";
import { DEFAULT_HOMEPAGE_LAYOUT } from "../../types";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import ThemePicker from "../../components/ThemePicker";
import AccentPicker from "../../components/AccentPicker";
import DensityPicker from "../../components/DensityPicker";
import { SCard, SSwitch, SRadioCard } from "../../components/settings/kit";
import { useTheme } from "../../hooks/useTheme";
import { applyAppearance } from "../../hooks/useAppearance";
import { cn } from "@/lib/utils";

const DEFAULT_CROWDED_WEEK_THRESHOLD = 5;

const SECTION_LABELS: Record<string, string> = {
  up_next: "settings.homepage.sections.up_next",
  unwatched: "settings.homepage.sections.unwatched",
  movies_to_watch: "settings.homepage.sections.movies_to_watch",
  recommendations: "settings.homepage.sections.recommendations",
  today: "settings.homepage.sections.today",
  upcoming: "settings.homepage.sections.upcoming",
  upcoming_movies: "settings.homepage.sections.upcoming_movies",
  airing_soon: "settings.homepage.sections.airing_soon",
  friends_loved: "settings.homepage.sections.friends_loved",
  streak: "settings.homepage.sections.streak",
};

function ThemeSection() {
  const { t } = useTranslation();

  return (
    <SCard
      title={t("settings.theme.title")}
      subtitle={t("settings.theme.subtitle")}
    >
      <ThemePicker />
    </SCard>
  );
}

function AppearanceControls({
  initialData,
}: {
  initialData: AppearanceSettings;
}) {
  const { t } = useTranslation();
  const { setTheme } = useTheme();
  const qc = useQueryClient();
  const [settings, setSettings] = useState<AppearanceSettings>(initialData);
  const feedback = useSettingsSave();

  // Apply appearance and theme on mount from server-fetched data
  useEffect(() => {
    applyAppearance(initialData);
    if (initialData.themeVariant)
      setTheme(initialData.themeVariant as Parameters<typeof setTheme>[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — initialData is stable on first render; setTheme identity not tracked

  function save(patch: Partial<AppearanceSettings>) {
    if (feedback.status === "saving") return;
    const next = { ...settings, ...patch };
    setSettings(next);
    applyAppearance(next);
    void feedback.save(async () => {
      const updated = await api.updateAppearanceSettings({
        ...next,
        themeVariant: undefined,
      });
      setSettings(updated);
      applyAppearance(updated);
      qc.setQueryData(["appearance-settings"], updated);
    });
  }

  function handleAccentChange(accent: AccentColor) {
    save({ accentColor: accent });
  }

  function handleDensityChange(density: Density) {
    save({ density });
  }

  return (
    <fieldset disabled={feedback.status === "saving"} className="min-w-0">
      <SCard
        title={t("settings.accent.title")}
        subtitle={t("settings.accent.subtitle")}
      >
        <AccentPicker
          value={settings.accentColor}
          onChange={handleAccentChange}
        />
        <SaveFeedback {...feedback} />
      </SCard>

      <SCard
        title={t("settings.density.title")}
        subtitle={t("settings.density.subtitle")}
      >
        <DensityPicker
          value={settings.density}
          onChange={handleDensityChange}
        />
      </SCard>

      <SCard
        title={t("settings.displayPrefs.title")}
        subtitle={t("settings.displayPrefs.subtitle")}
      >
        <div className="flex flex-col gap-4">
          <SSwitch
            label={t("settings.displayPrefs.reduceMotion")}
            sub={t("settings.displayPrefs.reduceMotionDesc")}
            on={settings.reduceMotion === 1}
            onChange={(v) => save({ reduceMotion: v ? 1 : 0 })}
          />
          <SSwitch
            label={t("settings.displayPrefs.highContrast")}
            sub={t("settings.displayPrefs.highContrastDesc")}
            on={settings.highContrast === 1}
            onChange={(v) => save({ highContrast: v ? 1 : 0 })}
          />
          <SSwitch
            label={t("settings.displayPrefs.hideSpoilers")}
            sub={t("settings.displayPrefs.hideSpoilersDesc")}
            on={settings.hideEpisodeSpoilers === 1}
            onChange={(v) => save({ hideEpisodeSpoilers: v ? 1 : 0 })}
          />
          <SSwitch
            label={t("settings.displayPrefs.autoplayTrailers")}
            sub={t("settings.displayPrefs.autoplayTrailersDesc")}
            on={settings.autoplayTrailers === 1}
            onChange={(v) => save({ autoplayTrailers: v ? 1 : 0 })}
          />
        </div>
      </SCard>
    </fieldset>
  );
}

function AppearanceSection() {
  const { data } = useQuery({
    queryKey: ["appearance-settings"],
    queryFn: ({ signal }) => api.getAppearanceSettings(signal),
  });

  if (!data) return null;

  return <AppearanceControls initialData={data} />;
}

function HomepageLayoutSection() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [draftLayout, setLayout] = useState<HomepageSection[] | undefined>();

  const feedback = useSettingsSave();
  const dragIndexRef = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ["homepage-layout"],
    queryFn: ({ signal }) => api.getHomepageLayout(signal),
  });

  const layout =
    draftLayout ?? data?.homepage_layout ?? DEFAULT_HOMEPAGE_LAYOUT;

  function save(newLayout: HomepageSection[]) {
    void feedback.save(async () => {
      const res = await api.updateHomepageLayout(newLayout);
      setLayout(res.homepage_layout);
      qc.setQueryData(["homepage-layout"], res);
    });
  }

  function toggleEnabled(id: string) {
    const updated = layout.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s,
    );
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
    feedback.markDirty();
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
    <fieldset disabled={feedback.status === "saving"} className="min-w-0">
      <SCard
        title={t("settings.homepage.title")}
        subtitle={t("settings.homepage.description")}
      >
        <div className="flex flex-col gap-1.5">
          {layout.map((section, index) => (
            <div
              key={section.id}
              draggable={feedback.status !== "saving"}
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
                aria-label={
                  section.enabled
                    ? t("settings.homepage.hideSection")
                    : t("settings.homepage.showSection")
                }
              >
                {section.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
        </div>
        <SaveFeedback {...feedback} />
      </SCard>
    </fieldset>
  );
}

function CrowdedWeekSection() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [draftEnabled, setEnabled] = useState<boolean | undefined>();
  const [draftThreshold, setThreshold] = useState<number | undefined>();

  const feedback = useSettingsSave();

  const { data } = useQuery({
    queryKey: ["crowded-week-settings"],
    queryFn: ({ signal }) => api.getCrowdedWeekSettings(signal),
  });

  const enabled = draftEnabled ?? data?.crowdedWeekBadgeEnabled !== 0;
  const threshold =
    draftThreshold ??
    data?.crowdedWeekThreshold ??
    DEFAULT_CROWDED_WEEK_THRESHOLD;

  function save(updates: {
    crowdedWeekBadgeEnabled?: number;
    crowdedWeekThreshold?: number;
  }) {
    void feedback.save(async () => {
      const res = await api.updateCrowdedWeekSettings({
        crowdedWeekBadgeEnabled: enabled ? 1 : 0,
        crowdedWeekThreshold: threshold,
        ...updates,
      });
      setEnabled(res.crowdedWeekBadgeEnabled !== 0);
      setThreshold(res.crowdedWeekThreshold);
      qc.setQueryData(["crowded-week-settings"], res);
    });
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
    feedback.markDirty();
  }

  function handleThresholdBlur() {
    save({ crowdedWeekThreshold: threshold });
  }

  return (
    <fieldset disabled={feedback.status === "saving"} className="min-w-0">
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
                enabled ? "bg-amber-500" : "bg-zinc-700",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {enabled && (
            <div className="flex items-center justify-between">
              <label
                htmlFor="crowded-week-threshold"
                className="text-sm font-medium text-zinc-200"
              >
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
        <SaveFeedback {...feedback} />
      </SCard>
    </fieldset>
  );
}

function AdvisorySection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const feedback = useSettingsSave();

  const { data } = useQuery({
    queryKey: ADVISORY_QUERY_KEY,
    queryFn: ({ signal }) => api.getAdvisorySettings(signal),
  });

  if (!data) return null;

  function save(level: (typeof ADVISORY_LEVELS)[number]) {
    void feedback.save(async () => {
      const next = await api.updateAdvisorySettings({ level });
      qc.setQueryData(ADVISORY_QUERY_KEY, next);
    });
  }

  return (
    <fieldset disabled={feedback.status === "saving"} className="min-w-0">
      <SCard
        title={t("settings.advisory.title")}
        subtitle={t("settings.advisory.subtitle")}
      >
        <div
          role="radiogroup"
          aria-label={t("settings.advisory.title")}
          className="flex flex-col gap-2"
        >
          {ADVISORY_LEVELS.map((level) => (
            <SRadioCard
              key={level}
              asRadio
              selected={data.level === level}
              title={t(`settings.advisory.levels.${level}.label`)}
              desc={t(`settings.advisory.levels.${level}.desc`)}
              onClick={() => void save(level)}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {t("settings.advisory.privacy")}
        </p>
        <SaveFeedback {...feedback} />
      </SCard>
    </fieldset>
  );
}

export default function AppearanceTab() {
  return (
    <>
      <ThemeSection />
      <AppearanceSection />
      <AdvisorySection />
      <HomepageLayoutSection />
      <CrowdedWeekSection />
    </>
  );
}
