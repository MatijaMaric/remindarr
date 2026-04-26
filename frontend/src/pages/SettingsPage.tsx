import { Suspense } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { Kicker } from "../components/design";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";
import { lazyWithRetry } from "../lib/lazyWithRetry";

const AccountTab = lazyWithRetry(() => import("./settings/AccountTab"));
const AppearanceTab = lazyWithRetry(() => import("./settings/AppearanceTab"));
const NotificationsTab = lazyWithRetry(() => import("./settings/NotificationsTab"));
const IntegrationsTab = lazyWithRetry(() => import("./settings/IntegrationsTab"));
const AdminTab = lazyWithRetry(() => import("./settings/AdminTab"));

const VALID_TABS = ["account", "appearance", "notifications", "integrations", "admin"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  if (!user) return null;

  const rawTab = searchParams.get("tab") ?? "account";
  const activeTab: SettingsTab =
    (VALID_TABS as readonly string[]).includes(rawTab) && (rawTab !== "admin" || user.is_admin)
      ? (rawTab as SettingsTab)
      : "account";

  function setTab(value: string) {
    const tab = value as SettingsTab;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "account") {
          next.delete("tab");
        } else {
          next.set("tab", tab);
        }
        return next;
      },
      { replace: true },
    );
  }

  const TABS = [
    { value: "account", label: t("settings.tabs.account") },
    { value: "appearance", label: t("settings.tabs.appearance") },
    { value: "notifications", label: t("settings.tabs.notifications") },
    { value: "integrations", label: t("settings.tabs.integrations") },
    ...(user.is_admin ? [{ value: "admin", label: t("settings.tabs.admin") }] : []),
  ];

  const breadcrumbLabel = TABS.find((x) => x.value === activeTab)?.label ?? activeTab;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="pt-4 pb-3">
        <Kicker>
          Your preferences{user.username ? ` · ${user.username}` : ""}
        </Kicker>
        <h1 className="text-4xl md:text-[44px] font-extrabold tracking-[-0.03em] leading-none text-zinc-100">
          {t("settings.title")}
        </h1>
      </div>

      {/* Breadcrumb */}
      <div className="pb-4 font-mono text-xs text-zinc-500 tracking-wide">
        <span className="opacity-60">/settings</span>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-amber-400">{breadcrumbLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-4 sm:gap-9">
        <SettingsSidebar
          tabs={TABS}
          active={activeTab}
          onSelect={setTab}
          buildInfo={
            <div className="space-y-0.5">
              <div>Remindarr · self-hosted</div>
              <div className="text-zinc-500">TMDB · {navigator.language || "en"}</div>
            </div>
          }
        />

        <div className="min-w-0">
          <Suspense fallback={<div className="p-8 text-zinc-400">Loading…</div>}>
            {activeTab === "account" && <AccountTab />}
            {activeTab === "appearance" && <AppearanceTab />}
            {activeTab === "notifications" && <NotificationsTab />}
            {activeTab === "integrations" && <IntegrationsTab />}
            {activeTab === "admin" && user.is_admin && <AdminTab />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
