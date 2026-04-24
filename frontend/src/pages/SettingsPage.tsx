import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { JobsResponse, Notifier, Integration, PlexServer } from "../api";
import type { AdminSettings, Title, HomepageSection } from "../types";
import { DEFAULT_HOMEPAGE_LAYOUT } from "../types";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "../lib/push";
import { authClient } from "../lib/auth-client";
import { UserPlus, GripVertical, Eye, EyeOff } from "lucide-react";
import ThemePicker from "../components/ThemePicker";
import { Kicker } from "../components/design";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";
import {
  SCard,
  SLabel,
  SFormRow,
  SSwitch,
  SRadioCard,
  SStatusPill,
  SHint,
  SDivider,
  SKeyValue,
  SButton,
  SInput,
  SMessage,
} from "../components/settings/kit";
import { cn } from "@/lib/utils";

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
          {activeTab === "account" && <AccountTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "integrations" && <IntegrationsTab />}
          {activeTab === "admin" && user.is_admin && <AdminTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Tab containers ──────────────────────────────────────────────────────────

function AccountTab() {
  return (
    <>
      <UserSection />
      <PasskeySection />
      <ProfileVisibilitySection />
      <SocialSection />
    </>
  );
}

function AppearanceTab() {
  return (
    <>
      <ThemeSection />
      <HomepageLayoutSection />
    </>
  );
}

function NotificationsTab() {
  return (
    <>
      {isPushSupported() && <PushNotificationsSection />}
      <NotificationsSection />
    </>
  );
}

function IntegrationsTab() {
  return (
    <>
      <PlexSection />
      <CalendarFeedSection />
      <WatchlistSection />
      <CsvImportSection />
    </>
  );
}

function AdminTab() {
  return (
    <>
      <BackgroundJobsSection />
      <AdminSection />
    </>
  );
}

// ─── Account tab sections ────────────────────────────────────────────────────

function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 5);
}

function UserSection() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    setPasswordErr("");
    setLoading(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        throw new Error(result.error.message || "Password change failed");
      }
      setPasswordMsg(t("profile.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: unknown) {
      setPasswordErr(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const strength = passwordStrength(newPassword);
  const strengthLabel = strength >= 4 ? "strong" : strength >= 3 ? "good" : strength > 0 ? "weak" : "";

  const initials = (user?.username ?? "??").slice(0, 2).toUpperCase();

  return (
    <>
      <SCard
        title={t("profile.title")}
        subtitle="Your account identity. Username is used on public profile pages and friend activity."
      >
        <div className="grid grid-cols-[80px_1fr] sm:grid-cols-[96px_1fr] gap-6 items-start">
          <div
            aria-hidden="true"
            className="w-20 sm:w-24 h-20 sm:h-24 rounded-full flex items-center justify-center font-extrabold text-[28px] text-black"
            style={{ background: "oklch(0.72 0.12 250)" }}
          >
            {initials}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-w-0">
            <SFormRow label={t("profile.username")}>
              <SInput value={user?.username ?? ""} mono readOnly />
            </SFormRow>
            <SFormRow label="Auth provider">
              <SInput value={user?.auth_provider ?? "local"} mono readOnly />
            </SFormRow>
            <SFormRow label="Display name">
              <SInput value={user?.display_name ?? user?.username ?? ""} readOnly />
            </SFormRow>
            <SFormRow label="Role">
              <SInput value={user?.is_admin ? "admin" : "user"} mono readOnly />
            </SFormRow>
          </div>
        </div>
      </SCard>

      {user && user.auth_provider === "local" && (
        <SCard
          title={t("profile.changePassword")}
          subtitle="Use at least 6 characters. We recommend a long passphrase."
        >
          <form onSubmit={handleChangePassword} className="space-y-3.5">
            {passwordMsg && <SMessage kind="success">{passwordMsg}</SMessage>}
            {passwordErr && <SMessage kind="error">{passwordErr}</SMessage>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-[640px]">
              <SFormRow label={t("profile.currentPassword")}>
                <SInput
                  type="password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  required
                />
              </SFormRow>
              <SFormRow
                label={t("profile.newPassword")}
                hint={strengthLabel ? <span>strength: {strengthLabel}</span> : undefined}
              >
                <SInput
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </SFormRow>
            </div>
            <div className="flex gap-1 max-w-[300px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-[4px] rounded-sm",
                    i < strength ? "bg-amber-400" : "bg-zinc-700",
                  )}
                />
              ))}
            </div>
            <div>
              <SButton type="submit" disabled={loading}>
                {loading ? t("profile.changing") : t("profile.changePassword")}
              </SButton>
            </div>
          </form>
        </SCard>
      )}

      {SUPPORTED_LANGUAGES.length > 1 && (
        <SCard
          title={t("profile.language")}
          subtitle="Changes apply immediately. Title metadata is fetched in TMDB's own language."
        >
          <div className="flex gap-1.5 flex-wrap">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer bg-zinc-800 text-zinc-200 border border-white/[0.08] hover:bg-amber-400 hover:text-black hover:border-transparent flex items-center gap-1.5"
              >
                <span className="font-mono text-[10px] text-zinc-500">
                  {lang.code}
                </span>
                {lang.label}
              </button>
            ))}
          </div>
        </SCard>
      )}
    </>
  );
}

interface PasskeyItem {
  id: string;
  name: string | null;
  createdAt: string | Date | null;
}

function PasskeySection() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const webauthnSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const loadPasskeys = useCallback(async () => {
    try {
      const result = await authClient.passkey.listUserPasskeys();
      if (result.data) {
        setPasskeys(result.data as PasskeyItem[]);
      }
    } catch {
      // Passkeys may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (webauthnSupported) {
      loadPasskeys();
    } else {
      setLoading(false);
    }
  }, [webauthnSupported, loadPasskeys]);

  async function handleAddPasskey() {
    setMsg("");
    setErr("");
    setAdding(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName || user?.username || undefined,
      });
      if (result?.error) {
        throw new Error(String(result.error.message || t("profile.passkeyAddFailed")));
      }
      setMsg(t("profile.passkeyAdded"));
      setPasskeyName("");
      await loadPasskeys();
    } catch (e: unknown) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setMsg("");
    setErr("");
    setDeleting(id);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result?.error) {
        throw new Error(String(result.error.message || "Failed to delete passkey"));
      }
      setMsg(t("profile.passkeyDeleted"));
      await loadPasskeys();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  async function handleRenamePasskey(id: string) {
    if (!editName.trim()) return;
    setMsg("");
    setErr("");
    try {
      const result = await authClient.passkey.updatePasskey({ id, name: editName.trim() });
      if (result?.error) {
        throw new Error(String(result.error.message || "Failed to rename passkey"));
      }
      setMsg(t("profile.passkeyRenamed"));
      setEditing(null);
      setEditName("");
      await loadPasskeys();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!webauthnSupported) return null;

  return (
    <SCard
      title={t("profile.passkeys")}
      subtitle="Sign in with Face ID, Touch ID, Windows Hello, or a security key."
    >
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        {loading ? (
          <p className="text-zinc-400 text-sm">{t("common.loading")}</p>
        ) : (
          <>
            {passkeys.length === 0 ? (
              <p className="text-zinc-400 text-sm py-1">{t("profile.noPasskeys")}</p>
            ) : (
              <ul className="space-y-2">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="bg-zinc-800 rounded-[10px] px-3.5 py-3 flex items-center gap-3.5"
                  >
                    {editing === pk.id ? (
                      <form
                        className="flex items-center gap-2 flex-1"
                        onSubmit={(e) => { e.preventDefault(); handleRenamePasskey(pk.id); }}
                      >
                        <SInput
                          value={editName}
                          onChange={setEditName}
                          autoFocus
                          aria-label="Passkey name"
                        />
                        <SButton type="submit" small>
                          {t("common.save")}
                        </SButton>
                        <SButton
                          type="button"
                          variant="ghost"
                          small
                          onClick={() => { setEditing(null); setEditName(""); }}
                        >
                          {t("common.cancel")}
                        </SButton>
                      </form>
                    ) : (
                      <>
                        <div
                          aria-hidden="true"
                          className="w-9 h-9 rounded-lg bg-zinc-700 text-amber-400 font-mono font-bold text-sm flex items-center justify-center"
                        >
                          ◈
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">
                            {pk.name || t("profile.passkeyUnnamed")}
                          </div>
                          {pk.createdAt && (
                            <div className="text-[11px] text-zinc-500 font-mono">
                              Created {new Date(pk.createdAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <SButton
                          variant="ghost"
                          small
                          onClick={() => { setEditing(pk.id); setEditName(pk.name || ""); }}
                        >
                          {t("profile.renamePasskey")}
                        </SButton>
                        <SButton
                          variant="outline"
                          small
                          danger
                          disabled={deleting === pk.id}
                          onClick={() => handleDeletePasskey(pk.id)}
                        >
                          {deleting === pk.id ? t("profile.deletingPasskey") : t("profile.deletePasskey")}
                        </SButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1 bg-zinc-800 rounded-[10px] p-3.5">
              <div className="flex-1">
                <SLabel hint={<span>optional</span>}>
                  {t("profile.passkeyName")}
                </SLabel>
                <SInput
                  value={passkeyName}
                  onChange={setPasskeyName}
                  placeholder={t("profile.passkeyNamePlaceholder")}
                />
              </div>
              <SButton onClick={handleAddPasskey} disabled={adding} icon="+">
                {adding ? t("profile.addingPasskey") : t("profile.addPasskey")}
              </SButton>
            </div>
          </>
        )}
      </div>
    </SCard>
  );
}

const VISIBILITY_OPTIONS = ["public", "friends_only", "private"] as const;

function ProfileVisibilitySection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<string>("private");
  const [titles, setTitles] = useState<(Title & { public: boolean })[]>([]);
  const [updatingGlobal, setUpdatingGlobal] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.getTrackedTitles();
      setVisibility(data.profile_visibility || (data.profile_public ? "public" : "private"));
      setTitles(data.titles);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleVisibilityChange(newVisibility: string) {
    setErr("");
    setUpdatingGlobal(true);
    try {
      await api.updateProfileVisibility(newVisibility);
      setVisibility(newVisibility);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingGlobal(false);
    }
  }

  async function handleBulkVisibility(isPublic: boolean) {
    setErr("");
    setUpdatingAll(true);
    try {
      await api.updateAllTitleVisibility(isPublic);
      setTitles((prev) => prev.map((x) => ({ ...x, public: isPublic })));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingAll(false);
    }
  }

  if (loading) {
    return (
      <SCard title={t("settings.profileVisibility")}>
        <div className="text-zinc-500 text-sm">{t("common.loading")}</div>
      </SCard>
    );
  }

  return (
    <SCard
      title={t("settings.profileVisibility")}
      subtitle={t("settings.profileVisibilityDescription")}
    >
      {err && (
        <div className="mb-4">
          <SMessage kind="error">{err}</SMessage>
        </div>
      )}

      <div data-testid="visibility-selector" className="space-y-2">
        {VISIBILITY_OPTIONS.map((option) => (
          <label
            key={option}
            className={cn(
              "block",
              updatingGlobal && "opacity-50 pointer-events-none",
            )}
          >
            <input
              type="radio"
              name="profile-visibility"
              value={option}
              checked={visibility === option}
              onChange={() => handleVisibilityChange(option)}
              disabled={updatingGlobal}
              className="sr-only peer"
            />
            <SRadioCard
              selected={visibility === option}
              title={t(`settings.visibility_${option}`)}
              desc={t(`settings.visibility_${option}_desc`)}
              onClick={() => handleVisibilityChange(option)}
              disabled={updatingGlobal}
            />
          </label>
        ))}
      </div>

      {titles.length > 0 ? (
        <>
          <SDivider label="Per-title overrides" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-400 mr-auto">
              {t("settings.perTitleVisibility")}
            </span>
            <SButton
              variant="ghost"
              small
              onClick={() => handleBulkVisibility(true)}
              disabled={updatingAll}
            >
              {t("settings.showAll")}
            </SButton>
            <SButton
              variant="ghost"
              small
              onClick={() => handleBulkVisibility(false)}
              disabled={updatingAll}
            >
              {t("settings.hideAll")}
            </SButton>
          </div>
        </>
      ) : (
        <p className="text-zinc-500 text-sm mt-4">{t("settings.noTrackedTitles")}</p>
      )}
    </SCard>
  );
}

function SocialSection() {
  const { t } = useTranslation();

  return (
    <SCard
      title="Social"
      subtitle="Invite friends to your Remindarr instance. They'll get a limited signup link."
    >
      <Link
        to="/invite"
        className="flex items-center gap-3 p-4 bg-zinc-800 rounded-[10px] hover:bg-zinc-800/80 transition-colors"
      >
        <span
          aria-hidden="true"
          className="w-10 h-10 rounded-[10px] bg-amber-400/10 text-amber-400 flex items-center justify-center"
        >
          <UserPlus size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 mb-0.5">
            {t("invite.settingsLink")}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Manage invite codes on the Invite page
          </div>
        </div>
        <span aria-hidden="true" className="text-amber-400 font-mono">
          →
        </span>
      </Link>
    </SCard>
  );
}

// ─── Appearance tab sections ─────────────────────────────────────────────────

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

const SECTION_LABELS: Record<string, string> = {
  unwatched: "settings.homepage.sections.unwatched",
  recommendations: "settings.homepage.sections.recommendations",
  today: "settings.homepage.sections.today",
  upcoming: "settings.homepage.sections.upcoming",
};

function HomepageLayoutSection() {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<HomepageSection[]>(DEFAULT_HOMEPAGE_LAYOUT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    api.getHomepageLayout()
      .then((res) => setLayout(res.homepage_layout))
      .catch(() => {});
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

// ─── Notifications tab sections ──────────────────────────────────────────────

function PushNotificationsSection() {
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [pushNotifier, setPushNotifier] = useState<Notifier | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [permissionState, setPermissionState] = useState(Notification.permission);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [{ notifiers }, subscription] = await Promise.all([
        api.getNotifiers(),
        getExistingSubscription(),
      ]);
      const webpushNotifier = notifiers.find((n) => n.provider === "webpush") || null;

      if (webpushNotifier && !webpushNotifier.enabled) {
        try { await unsubscribeFromPush(); } catch { /* ignore */ }
        try { await api.deleteNotifier(webpushNotifier.id); } catch { /* ignore */ }
        setPushNotifier(null);
        setHasSubscription(false);
        setErr("Push subscription expired. Please re-enable push notifications.");
      } else if (webpushNotifier && !subscription) {
        try { await api.deleteNotifier(webpushNotifier.id); } catch { /* ignore */ }
        setPushNotifier(null);
        setHasSubscription(false);
      } else {
        setPushNotifier(webpushNotifier);
        setHasSubscription(!!subscription);
      }
      setPermissionState(Notification.permission);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleEnable() {
    setMsg("");
    setErr("");
    setEnabling(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== "granted") {
        setErr("Notification permission denied. Please enable it in your browser settings.");
        return;
      }

      const { publicKey } = await api.getVapidPublicKey();
      const subscription = await subscribeToPush(publicKey);

      const { notifier } = await api.createNotifier({
        provider: "webpush",
        config: subscription,
        notify_time: "09:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      const testResult = await api.testNotifier(notifier.id);
      if (!testResult.success && testResult.message.toLowerCase().includes("subscription expired")) {
        try { await unsubscribeFromPush(); } catch { /* ignore */ }
        try { await api.deleteNotifier(notifier.id); } catch { /* ignore */ }
        setErr("Could not establish a working push subscription. Please try clearing site data and re-enabling.");
        await refresh();
        return;
      }

      setMsg("Push notifications enabled");
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEnabling(false);
    }
  }

  async function handleDisable() {
    setMsg("");
    setErr("");
    setDisabling(true);
    try {
      await unsubscribeFromPush();
      if (pushNotifier) {
        await api.deleteNotifier(pushNotifier.id);
      }
      setMsg("Push notifications disabled");
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDisabling(false);
    }
  }

  async function handleTest() {
    if (!pushNotifier) return;
    setMsg("");
    setErr("");
    setTesting(true);
    try {
      const result = await api.testNotifier(pushNotifier.id);
      if (result.success) {
        setMsg(result.message);
      } else if (result.message.toLowerCase().includes("subscription expired")) {
        try { await unsubscribeFromPush(); } catch { /* ignore */ }
        try { await api.deleteNotifier(pushNotifier.id); } catch { /* ignore */ }
        setPushNotifier(null);
        setHasSubscription(false);
        setErr("Push subscription expired. Please re-enable push notifications.");
      } else {
        setErr(result.message);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const { t } = useTranslation();

  if (loading) {
    return (
      <SCard
        title={t("profile.pushNotifications")}
        subtitle="Native notifications directly from the browser. Works even when Remindarr is closed."
      >
        <div className="text-zinc-500 text-sm">{t("profile.loadingPushStatus")}</div>
      </SCard>
    );
  }

  const isEnabled = !!pushNotifier && pushNotifier.enabled && hasSubscription;
  const isDenied = permissionState === "denied";

  return (
    <SCard
      title={t("profile.pushNotifications")}
      subtitle="Native notifications directly from the browser. Works even when Remindarr is closed."
    >
      <div className="space-y-3.5">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        <div
          className={cn(
            "flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-[10px] border",
            isEnabled
              ? "bg-gradient-to-br from-amber-400/[0.08] to-amber-400/[0.02] border-amber-400/30"
              : "bg-zinc-800 border-white/[0.06]",
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "w-14 h-14 rounded-[14px] flex items-center justify-center font-mono font-extrabold text-2xl shrink-0",
              isEnabled ? "bg-amber-400 text-black" : "bg-zinc-700 text-zinc-400",
            )}
          >
            ◉
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
              <div className="text-base font-bold text-zinc-100">
                {isEnabled ? "Push notifications are enabled" : "Get notified about new releases"}
              </div>
              {isEnabled && <SStatusPill kind="ok">Active</SStatusPill>}
            </div>
            <div className="text-xs text-zinc-400 font-mono leading-relaxed">
              {isEnabled
                ? "You'll receive notifications on this device"
                : isDenied
                  ? "Notifications are blocked. Enable them in your browser settings."
                  : "Receive native push notifications for new episodes and movies"}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {isEnabled ? (
              <>
                <SButton variant="ghost" onClick={handleTest} disabled={testing}>
                  {testing ? t("profile.testing") : t("profile.testPush")}
                </SButton>
                <SButton danger onClick={handleDisable} disabled={disabling}>
                  {disabling ? t("profile.disabling") : t("profile.disablePush")}
                </SButton>
              </>
            ) : (
              <SButton onClick={handleEnable} disabled={enabling || isDenied}>
                {enabling ? t("profile.enabling") : t("profile.enablePush")}
              </SButton>
            )}
          </div>
        </div>
      </div>
    </SCard>
  );
}

const TIMEZONE_OPTIONS = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Europe/Zagreb", "Asia/Tokyo"];
  }
})();

const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
  discord:  { label: "Discord",  icon: "D", color: "oklch(0.6 0.18 275)" },
  telegram: { label: "Telegram", icon: "T", color: "oklch(0.72 0.13 225)" },
  ntfy:     { label: "ntfy",     icon: "◉", color: "oklch(0.72 0.17 25)" },
  gotify:   { label: "Gotify",   icon: "G", color: "oklch(0.72 0.15 85)" },
  webhook:  { label: "Webhook",  icon: "W", color: "oklch(0.7 0.06 200)" },
};

function providerMeta(id: string) {
  return PROVIDER_META[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1), icon: id.charAt(0).toUpperCase(), color: "oklch(0.7 0.06 200)" };
}

function NotificationsSection() {
  const [notifiers, setNotifiers] = useState<Notifier[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const [formProvider, setFormProvider] = useState("discord");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formBotToken, setFormBotToken] = useState("");
  const [formChatId, setFormChatId] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formTimezone, setFormTimezone] = useState(USER_TIMEZONE);
  const [formDigestMode, setFormDigestMode] = useState<"daily" | "weekly" | "off">("daily");
  const [formDigestDay, setFormDigestDay] = useState<number>(1);
  const [formStreamingAlerts, setFormStreamingAlerts] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([api.getNotifiers(), api.getNotifierProviders()])
      .then(([n, p]) => {
        setNotifiers(n.notifiers.filter((x) => x.provider !== "webpush"));
        setProviders(p.providers.filter((x) => x !== "webpush"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resetForm() {
    setFormProvider("discord");
    setFormWebhookUrl("");
    setFormUrl("");
    setFormToken("");
    setFormSecret("");
    setFormBotToken("");
    setFormChatId("");
    setFormTime("09:00");
    setFormTimezone(USER_TIMEZONE);
    setFormDigestMode("daily");
    setFormDigestDay(1);
    setFormStreamingAlerts(true);
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(n: Notifier) {
    setEditingId(n.id);
    setFormProvider(n.provider);
    setFormWebhookUrl(n.config.webhookUrl || "");
    setFormUrl(n.config.url || "");
    setFormToken(n.config.token || "");
    setFormSecret(n.config.secret || "");
    setFormBotToken(n.config.botToken || "");
    setFormChatId(n.config.chatId || "");
    setFormTime(n.notify_time);
    setFormTimezone(n.timezone);
    setFormDigestMode(n.digest_mode === "weekly" ? "weekly" : n.digest_mode === "off" ? "off" : "daily");
    setFormDigestDay(n.digest_day ?? 1);
    setFormStreamingAlerts(n.streaming_alerts_enabled !== false);
    setShowForm(true);
    setMsg("");
    setErr("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setSaving(true);

    const config: Record<string, string> = {};
    if (formProvider === "discord") {
      config.webhookUrl = formWebhookUrl;
    } else if (formProvider === "ntfy") {
      config.url = formUrl;
      if (formToken) config.token = formToken;
    } else if (formProvider === "webhook") {
      config.url = formUrl;
      if (formSecret) config.secret = formSecret;
    } else if (formProvider === "telegram") {
      config.botToken = formBotToken;
      config.chatId = formChatId;
    } else if (formProvider === "gotify") {
      config.url = formUrl;
      config.token = formToken;
    }

    const digestModeValue = formDigestMode === "daily" ? null : formDigestMode;
    const digestDayValue = formDigestMode === "weekly" ? formDigestDay : null;

    try {
      if (editingId) {
        await api.updateNotifier(editingId, {
          config,
          notify_time: formTime,
          timezone: formTimezone,
          digest_mode: digestModeValue,
          digest_day: digestDayValue,
          streaming_alerts_enabled: formStreamingAlerts,
        });
        setMsg("Notifier updated");
      } else {
        await api.createNotifier({
          provider: formProvider,
          config,
          notify_time: formTime,
          timezone: formTimezone,
          digest_mode: digestModeValue,
          digest_day: digestDayValue,
          streaming_alerts_enabled: formStreamingAlerts,
        });
        setMsg("Notifier created");
      }
      resetForm();
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setMsg("");
    setErr("");
    try {
      await api.deleteNotifier(id);
      setMsg("Notifier deleted");
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTest(id: string) {
    setMsg("");
    setErr("");
    setTesting(id);
    try {
      const result = await api.testNotifier(id);
      if (result.success) {
        setMsg(result.message);
      } else {
        setErr(result.message);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(null);
    }
  }

  async function handleToggle(n: Notifier) {
    setMsg("");
    setErr("");
    setToggling(n.id);
    try {
      await api.updateNotifier(n.id, { enabled: !n.enabled });
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <SCard title="Notifiers" subtitle="How and when you receive alerts">
        <div className="text-zinc-500 text-sm">Loading notifications...</div>
      </SCard>
    );
  }

  function describeDigest(n: Notifier) {
    if (n.digest_mode === "weekly") {
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n.digest_day ?? 1];
      return `Weekly · ${dayName}`;
    }
    if (n.digest_mode === "off") return "Off · per-event";
    return "Daily";
  }

  return (
    <>
      <SCard
        title="Notifiers"
        subtitle="How and when you receive alerts"
        action={
          !showForm && (
            <SButton icon="+" onClick={() => { resetForm(); setShowForm(true); setMsg(""); setErr(""); }}>
              Add notifier
            </SButton>
          )
        }
      >
        <div className="space-y-2.5">
          {msg && <SMessage kind="success">{msg}</SMessage>}
          {err && <SMessage kind="error">{err}</SMessage>}

          {notifiers.length === 0 && !showForm && (
            <p className="text-zinc-500 text-sm py-1">No notifiers configured.</p>
          )}

          {notifiers.map((n) => {
            const meta = providerMeta(n.provider);
            return (
              <div
                key={n.id}
                className={cn(
                  "p-4 bg-zinc-800 border border-white/[0.08] rounded-[10px]",
                  !n.enabled && "opacity-60",
                )}
              >
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <div
                    aria-hidden="true"
                    className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-extrabold text-black text-sm shrink-0"
                    style={{ background: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <div className="text-[15px] font-bold text-zinc-100">{meta.label}</div>
                      <SStatusPill kind={n.enabled ? "ok" : "neutral"}>
                        {n.enabled ? "Enabled" : "Disabled"}
                      </SStatusPill>
                      {n.streaming_alerts_enabled !== false && (
                        <SStatusPill kind="amber">Streaming alerts</SStatusPill>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    <SButton
                      variant="ghost"
                      small
                      onClick={() => handleToggle(n)}
                      disabled={toggling === n.id}
                    >
                      {toggling === n.id ? "..." : n.enabled ? "Disable" : "Enable"}
                    </SButton>
                    <SButton small onClick={() => handleTest(n.id)} disabled={testing === n.id}>
                      {testing === n.id ? "Sending..." : "Test"}
                    </SButton>
                    <SButton variant="ghost" small onClick={() => startEdit(n)}>
                      Edit
                    </SButton>
                    <SButton variant="outline" small danger onClick={() => handleDelete(n.id)}>
                      Delete
                    </SButton>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.04]">
                  <SKeyValue k="Time" v={`${n.notify_time} ${n.timezone}`} />
                  <SKeyValue k="Frequency" v={describeDigest(n)} />
                  <SKeyValue k="Last sent" v={n.last_sent_date ?? "—"} />
                </div>
              </div>
            );
          })}
        </div>
      </SCard>

      {showForm && (
        <SCard
          title={editingId ? "Edit notifier" : "Add a notifier"}
          subtitle="Pick a provider and configure delivery."
        >
          <form onSubmit={handleSave} className="space-y-0">
            <SLabel>Provider</SLabel>
            <div className="flex gap-2 mb-5 flex-wrap">
              {providers.map((p) => {
                const meta = providerMeta(p);
                const isActive = formProvider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!!editingId && !isActive}
                    onClick={() => !editingId && setFormProvider(p)}
                    className={cn(
                      "px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer",
                      isActive
                        ? "bg-amber-400 text-black"
                        : "bg-zinc-800 text-zinc-200 border border-white/[0.08] hover:bg-white/[0.1]",
                      !!editingId && !isActive && "opacity-30 cursor-not-allowed",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {formProvider === "discord" && (
                <SFormRow label="Webhook URL" hint={<span>required</span>} className="sm:col-span-2">
                  <SInput
                    type="url"
                    value={formWebhookUrl}
                    onChange={setFormWebhookUrl}
                    placeholder="https://discord.com/api/webhooks/..."
                    mono
                    required
                  />
                </SFormRow>
              )}

              {(formProvider === "ntfy" || formProvider === "webhook" || formProvider === "gotify") && (
                <SFormRow
                  label={
                    formProvider === "ntfy"
                      ? "Topic URL"
                      : formProvider === "gotify"
                        ? "Server URL"
                        : "Webhook URL"
                  }
                  hint={<span>required</span>}
                  className="sm:col-span-2"
                >
                  <SInput
                    type="url"
                    value={formUrl}
                    onChange={setFormUrl}
                    placeholder={
                      formProvider === "ntfy"
                        ? "https://ntfy.sh/my-topic"
                        : formProvider === "gotify"
                          ? "https://gotify.example.com"
                          : "https://your-server.com/hook"
                    }
                    mono
                    required
                  />
                </SFormRow>
              )}

              {(formProvider === "ntfy" || formProvider === "gotify") && (
                <SFormRow
                  label={formProvider === "gotify" ? "Application token" : "Access token"}
                  hint={formProvider === "ntfy" ? <span>optional</span> : undefined}
                  className="sm:col-span-2"
                >
                  <SInput
                    type="password"
                    value={formToken}
                    onChange={setFormToken}
                    placeholder={formProvider === "gotify" ? "App token from Gotify" : "Bearer token (leave empty for public topics)"}
                    required={formProvider === "gotify"}
                  />
                </SFormRow>
              )}

              {formProvider === "webhook" && (
                <SFormRow
                  label="Signing secret"
                  hint={<span>optional — HMAC-SHA256</span>}
                  className="sm:col-span-2"
                >
                  <SInput
                    type="password"
                    value={formSecret}
                    onChange={setFormSecret}
                    placeholder="Leave empty to skip request signing"
                  />
                </SFormRow>
              )}

              {formProvider === "telegram" && (
                <>
                  <SFormRow label="Bot token" hint={<span>required</span>}>
                    <SInput
                      type="password"
                      value={formBotToken}
                      onChange={setFormBotToken}
                      placeholder="123456789:ABCdef..."
                      required
                    />
                  </SFormRow>
                  <SFormRow label="Chat ID" hint={<span>required</span>}>
                    <SInput
                      value={formChatId}
                      onChange={setFormChatId}
                      placeholder="-1001234567890"
                      required
                    />
                  </SFormRow>
                </>
              )}

              <SFormRow label="Notification time">
                <SInput type="time" value={formTime} onChange={setFormTime} mono required />
              </SFormRow>
              <SFormRow label="Timezone">
                <SInput
                  value={formTimezone}
                  onChange={setFormTimezone}
                  list="timezone-list"
                  mono
                  required
                />
                <datalist id="timezone-list">
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </SFormRow>
            </div>

            <SDivider label="Frequency" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3.5">
              <SRadioCard
                selected={formDigestMode === "daily"}
                title="Daily digest"
                desc="One message at notify time with every new episode or release."
                onClick={() => setFormDigestMode("daily")}
              />
              <SRadioCard
                selected={formDigestMode === "weekly"}
                title="Weekly digest"
                desc="A single round-up each week. Quieter, but items can stack."
                onClick={() => setFormDigestMode("weekly")}
              />
              <SRadioCard
                selected={formDigestMode === "off"}
                title="Off · per-event"
                desc="Fires the instant a tracked title drops. Noisier."
                onClick={() => setFormDigestMode("off")}
              />
            </div>

            {formDigestMode === "weekly" && (
              <SFormRow label="Send digest on">
                <select
                  value={formDigestDay}
                  onChange={(e) => setFormDigestDay(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
                <div className="text-[11px] text-zinc-500 mt-1 font-mono">
                  Covers the next 7 days of releases
                </div>
              </SFormRow>
            )}

            <SDivider label="Triggers" />
            <SSwitch
              label="Streaming availability alerts"
              sub="Fires when a tracked title lands on a provider you have"
              on={formStreamingAlerts}
              onChange={setFormStreamingAlerts}
            />

            <div className="flex gap-2 mt-5 flex-wrap">
              <SButton type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update notifier" : "Create notifier"}
              </SButton>
              <SButton type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </SButton>
            </div>
          </form>
        </SCard>
      )}
    </>
  );
}

// ─── Integrations tab sections ───────────────────────────────────────────────

type ConnectStep =
  | { type: "idle" }
  | { type: "waiting"; pinId: number; authUrl: string }
  | { type: "pick_server"; authToken: string; servers: PlexServer[] };

const PLEX_POPUP_FEATURES = "width=800,height=700,menubar=no,toolbar=no,location=no,status=no";
const PIN_POLL_INTERVAL_MS = 2000;

function PlexSection() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ConnectStep>({ type: "idle" });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [selectedServer, setSelectedServer] = useState<PlexServer | null>(null);
  const [selectedUri, setSelectedUri] = useState("");
  const [syncMovies, setSyncMovies] = useState(true);
  const [syncEpisodes, setSyncEpisodes] = useState(true);

  const refresh = useCallback(() => {
    api.getIntegrations()
      .then((r) => {
        setIntegrations(r.integrations.filter((i) => i.provider === "plex"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (step.type !== "waiting") return;
    const timer = setInterval(async () => {
      try {
        const result = await api.checkPlexPin(step.pinId);
        if (!result.resolved) return;
        clearInterval(timer);
        const servers = result.servers ?? [];
        if (servers.length === 0) {
          setErr("No Plex servers found on your account.");
          setStep({ type: "idle" });
          return;
        }
        setStep({ type: "pick_server", authToken: result.authToken!, servers });
        setSelectedServer(servers[0]);
        const firstConn = servers[0].connections.find((c) => !c.relay) ?? servers[0].connections[0];
        setSelectedUri(firstConn?.uri ?? "");
      } catch {
        // Silently retry on next interval
      }
    }, PIN_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [step]);

  async function handleConnect() {
    setMsg("");
    setErr("");
    try {
      const { pinId, authUrl } = await api.createPlexPin();
      window.open(authUrl, "plex_auth", PLEX_POPUP_FEATURES);
      setStep({ type: "waiting", pinId, authUrl });
    } catch {
      setErr("Failed to start Plex authorization. Please try again.");
    }
  }

  function handleCancelConnect() {
    setStep({ type: "idle" });
    setSelectedServer(null);
    setSelectedUri("");
    setErr("");
  }

  function selectServer(server: PlexServer) {
    setSelectedServer(server);
    const firstConn = server.connections.find((c) => !c.relay) ?? server.connections[0];
    setSelectedUri(firstConn?.uri ?? "");
  }

  async function handleRefreshServers() {
    if (step.type !== "pick_server") return;
    setRefreshingServers(true);
    setErr("");
    try {
      const { servers } = await api.refreshPlexServers(step.authToken);
      setStep({ type: "pick_server", authToken: step.authToken, servers });
      if (servers.length > 0) {
        const current = selectedServer
          ? servers.find((s) => s.clientIdentifier === selectedServer.clientIdentifier)
          : null;
        selectServer(current ?? servers[0]);
      }
    } catch {
      setErr("Failed to refresh server list.");
    } finally {
      setRefreshingServers(false);
    }
  }

  async function handleSaveServer() {
    if (step.type !== "pick_server" || !selectedServer || !selectedUri) return;
    setSaving(true);
    setErr("");
    try {
      await api.createIntegration({
        provider: "plex",
        config: {
          plexToken: step.authToken,
          serverUrl: selectedUri,
          serverId: selectedServer.clientIdentifier,
          serverName: selectedServer.name,
          syncMovies,
          syncEpisodes,
        },
      });
      setStep({ type: "idle" });
      setMsg("Plex server connected successfully.");
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save integration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(id: string) {
    setMsg("");
    setErr("");
    setSyncing(id);
    try {
      const result = await api.triggerPlexSync(id);
      if (result.success) {
        setMsg(`Sync complete — ${result.moviesMarked ?? 0} movies, ${result.episodesMarked ?? 0} episodes marked watched.`);
      } else {
        setErr(result.error ?? "Sync failed.");
      }
      refresh();
    } catch {
      setErr("Sync failed.");
    } finally {
      setSyncing(null);
    }
  }

  async function handleToggle(integration: Integration) {
    setMsg("");
    setErr("");
    setToggling(integration.id);
    try {
      await api.updateIntegration(integration.id, { enabled: !integration.enabled });
      refresh();
    } catch {
      setErr("Failed to update integration.");
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: string) {
    setMsg("");
    setErr("");
    try {
      await api.deleteIntegration(id);
      setMsg("Plex integration disconnected.");
      refresh();
    } catch {
      setErr("Failed to disconnect integration.");
    }
  }

  function formatSyncTime(iso: string | null) {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  if (loading) return null;

  return (
    <SCard
      title="Plex"
      subtitle="Connect your Plex server to automatically sync your watched history."
    >
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        {integrations.length > 0 && (
          <div className="space-y-2">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="p-3.5 bg-zinc-800 border border-white/[0.08] rounded-[10px] flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <div className="text-sm font-bold text-zinc-100 truncate">
                      {integration.name}
                    </div>
                    <SStatusPill kind={integration.enabled ? "ok" : "neutral"}>
                      {integration.enabled ? "Enabled" : "Disabled"}
                    </SStatusPill>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono space-y-0.5">
                    <div className="truncate">{integration.config.serverUrl}</div>
                    <div>
                      Last sync: {formatSyncTime(integration.last_sync_at)}
                    </div>
                    {integration.last_sync_error && (
                      <div className="text-red-400">
                        Error: {integration.last_sync_error}
                      </div>
                    )}
                    <div className="flex gap-3 pt-1">
                      <span className={integration.config.syncMovies ? "text-zinc-300" : "text-zinc-600"}>Movies</span>
                      <span className={integration.config.syncEpisodes ? "text-zinc-300" : "text-zinc-600"}>Episodes</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <SButton
                    variant="ghost"
                    small
                    onClick={() => handleToggle(integration)}
                    disabled={toggling === integration.id}
                  >
                    {toggling === integration.id ? "..." : integration.enabled ? "Disable" : "Enable"}
                  </SButton>
                  <SButton
                    small
                    onClick={() => handleSync(integration.id)}
                    disabled={syncing === integration.id || !integration.enabled}
                  >
                    {syncing === integration.id ? "Syncing..." : "Sync now"}
                  </SButton>
                  <SButton
                    variant="outline"
                    small
                    danger
                    onClick={() => handleDelete(integration.id)}
                  >
                    Disconnect
                  </SButton>
                </div>
              </div>
            ))}
          </div>
        )}

        {step.type === "idle" && (
          <SButton onClick={handleConnect}>Connect Plex</SButton>
        )}

        {step.type === "waiting" && (
          <SHint kind="amber">
            <div className="mb-2">
              Waiting for authorization&hellip; Sign in and authorize Remindarr in the Plex popup.
            </div>
            <div className="text-[11px] text-zinc-400 mb-3">
              Popup blocked?{" "}
              <a
                href={step.authUrl}
                target="plex_auth"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline"
              >
                Open authorization page
              </a>
            </div>
            <SButton variant="ghost" small onClick={handleCancelConnect}>
              Cancel
            </SButton>
          </SHint>
        )}

        {step.type === "pick_server" && (
          <div className="bg-zinc-800 rounded-[10px] p-4 space-y-4">
            <div className="text-sm font-semibold text-zinc-100">Select a Plex server</div>

            <div className="space-y-2">
              {step.servers.map((server) => (
                <label
                  key={server.clientIdentifier}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="plex_server"
                    checked={selectedServer?.clientIdentifier === server.clientIdentifier}
                    onChange={() => selectServer(server)}
                    className="accent-amber-400"
                  />
                  <span className="text-sm text-zinc-100">{server.name}</span>
                </label>
              ))}
            </div>

            {selectedServer && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <SLabel>Connection URL</SLabel>
                  <button
                    onClick={handleRefreshServers}
                    disabled={refreshingServers}
                    className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {refreshingServers ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <select
                  value={selectedUri}
                  onChange={(e) => setSelectedUri(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                >
                  {selectedServer.connections.map((conn) => (
                    <option key={conn.uri} value={conn.uri}>
                      {conn.uri}{conn.local ? " (local)" : conn.relay ? " (relay)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <SLabel>Sync options</SLabel>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncMovies}
                    onChange={(e) => setSyncMovies(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Sync watched movies
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncEpisodes}
                    onChange={(e) => setSyncEpisodes(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Sync watched episodes
                </label>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <SButton onClick={handleSaveServer} disabled={saving || !selectedServer || !selectedUri}>
                {saving ? "Connecting..." : "Connect"}
              </SButton>
              <SButton variant="ghost" onClick={handleCancelConnect}>
                Cancel
              </SButton>
            </div>
          </div>
        )}
      </div>
    </SCard>
  );
}

function CalendarFeedSection() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getFeedToken()
      .then(({ token: tok }) => { setToken(tok); setLoadingToken(false); })
      .catch(() => setLoadingToken(false));
  }, []);

  const feedUrl = token ? `${window.location.origin}/api/feed/calendar.ics?token=${token}` : null;

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const { token: newToken } = await api.regenerateFeedToken();
      setToken(newToken);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SCard title={t("feed.title")} subtitle={t("feed.description")}>
      {loadingToken ? (
        <p className="text-sm text-zinc-500">{t("common.loading")}</p>
      ) : token ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <SInput
              value={feedUrl!}
              mono
              readOnly
              aria-label={t("feed.title")}
            />
            <div className="flex gap-2 shrink-0">
              <SButton variant="ghost" small onClick={handleCopy}>
                {copied ? t("feed.copied") : t("feed.copyUrl")}
              </SButton>
              <SButton
                variant="ghost"
                small
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? t("feed.regenerating") : t("feed.regenerate")}
              </SButton>
            </div>
          </div>
          <SHint kind="info">{t("feed.warning")}</SHint>
        </div>
      ) : (
        <SButton onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? t("feed.generating") : t("feed.generate")}
        </SButton>
      )}
    </SCard>
  );
}

function WatchlistSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const { t } = useTranslation();

  async function handleExport() {
    setMsg("");
    setErr("");
    setExporting(true);
    try {
      await api.exportWatchlist();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setErr("");
    setImporting(true);
    try {
      const result = await api.importWatchlist(file);
      setMsg(t("profile.importComplete", {
        imported: result.imported,
        skippedText: result.skipped > 0 ? t("profile.importSkipped", { count: result.skipped }) : "",
      }));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <SCard
      title={t("profile.watchlist")}
      subtitle="Back up your tracked titles and watch history as JSON. Importing merges, never overwrites."
    >
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-zinc-800 border border-white/[0.08] rounded-[10px]">
            <div className="text-sm font-bold text-zinc-100 mb-1">
              {t("profile.exportWatchlist")}
            </div>
            <div className="text-xs text-zinc-500 mb-3 leading-relaxed">
              {t("profile.exportDescription")}
            </div>
            <SButton icon="↓" onClick={handleExport} disabled={exporting}>
              {exporting ? t("profile.exporting") : t("profile.export")}
            </SButton>
          </div>
          <div className="p-4 bg-zinc-800 border border-white/[0.08] rounded-[10px]">
            <div className="text-sm font-bold text-zinc-100 mb-1">
              {t("profile.importWatchlist")}
            </div>
            <div className="text-xs text-zinc-500 mb-3 leading-relaxed">
              {t("profile.importDescription")}
            </div>
            <label
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg bg-white/[0.06] text-zinc-200 border border-white/[0.08] hover:bg-white/[0.1] transition-colors cursor-pointer",
                importing && "opacity-50 pointer-events-none",
              )}
            >
              <span>↑</span>
              {importing ? t("profile.importing") : t("profile.import")}
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImport}
                className="hidden"
                disabled={importing}
              />
            </label>
          </div>
        </div>
      </div>
    </SCard>
  );
}

function CsvImportSection() {
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setMsg("");
    setErr("");
    setImporting(true);
    try {
      const result = await api.importCsv(file);
      const parts: string[] = [`${result.imported} title${result.imported !== 1 ? "s" : ""} imported`];
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      setMsg(parts.join(", ") + ".");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <SCard title={t("import.title")} subtitle={t("import.description")}>
      <div className="space-y-3.5">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { n: "Letterboxd", hint: t("import.letterboxdHint") },
            { n: "IMDB", hint: t("import.imdbHint") },
            { n: "Trakt", hint: t("import.traktHint") },
          ].map((s) => (
            <div key={s.n} className="p-3.5 bg-zinc-800 border border-white/[0.08] rounded-[10px]">
              <div className="text-[13px] font-bold text-zinc-100 mb-1">{s.n}</div>
              <div className="text-[11px] text-zinc-500 font-mono leading-relaxed">{s.hint}</div>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "p-10 text-center border-2 border-dashed rounded-xl transition-colors cursor-pointer",
            dragOver
              ? "border-amber-400 bg-amber-400/10"
              : "border-zinc-700 hover:border-zinc-500 bg-white/[0.015]",
            importing && "opacity-50 pointer-events-none",
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-11 h-11 mx-auto mb-3 rounded-[10px] bg-zinc-800 text-amber-400 font-mono text-xl flex items-center justify-center">
            ↓
          </div>
          <div className="text-sm font-semibold text-zinc-100 mb-1">
            {t("import.dropHint")}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">.csv</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleInputChange}
            className="hidden"
            disabled={importing}
          />
        </div>

        <div>
          <label
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg bg-amber-400 text-black hover:bg-amber-300 transition-colors cursor-pointer",
              importing && "opacity-50 pointer-events-none",
            )}
          >
            {importing ? t("import.importing") : t("import.chooseFile")}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleInputChange}
              className="hidden"
              disabled={importing}
            />
          </label>
        </div>
      </div>
    </SCard>
  );
}

// ─── Admin tab sections ──────────────────────────────────────────────────────

function formatJobName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(date: string | null): string {
  if (!date) return "Never";
  const d = new Date(date + (date.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString();
}

function BackgroundJobsSection() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    api.getJobs().then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleTrigger(name: string) {
    setMsg("");
    setErr("");
    setTriggering(name);
    try {
      await api.triggerJob(name);
      setMsg(`Job "${formatJobName(name)}" queued successfully`);
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(null);
    }
  }

  if (loading) {
    return (
      <SCard title="Background jobs" subtitle="Cron + queue workers.">
        <div className="text-zinc-500 text-sm">Loading jobs...</div>
      </SCard>
    );
  }

  return (
    <SCard
      title="Background jobs"
      subtitle="Remindarr's cron + queue workers. Auto-refreshes every 15 seconds."
    >
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        {data?.crons.length === 0 && (
          <p className="text-zinc-500 text-sm">No scheduled jobs configured.</p>
        )}

        {data && data.crons.length > 0 && (
          <>
            <div className="hidden lg:grid grid-cols-[1.5fr_1fr_1.5fr_90px_100px] gap-3 px-3.5 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <div>Job</div>
              <div>Schedule</div>
              <div>Last run</div>
              <div>Status</div>
              <div />
            </div>
            <div className="space-y-1">
              {data.crons.map((cron) => {
                const stats = data.stats[cron.name];
                const isRunning = stats?.running > 0;
                const failed = stats && stats.failed > 0;
                const pillKind = !cron.enabled ? "neutral" : isRunning ? "amber" : failed ? "error" : "ok";
                const pillText = !cron.enabled ? "Off" : isRunning ? "Running" : failed ? "Fail" : "OK";
                return (
                  <div
                    key={cron.name}
                    className="px-3.5 py-3 bg-zinc-800 border border-white/[0.08] rounded-[10px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1.5fr_90px_100px] gap-2 lg:gap-3 lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100 truncate">
                        {formatJobName(cron.name)}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono truncate lg:hidden">
                        {cron.cron}
                      </div>
                    </div>
                    <code className="hidden lg:block text-[12px] text-zinc-400 font-mono truncate">
                      {cron.cron}
                    </code>
                    <div className="text-[11px] text-zinc-400 font-mono">
                      <div>Last: {formatDate(cron.last_run)}</div>
                      <div className="text-zinc-500">Next: {formatDate(cron.next_run)}</div>
                      {stats && (stats.pending > 0 || stats.running > 0 || stats.failed > 0) && (
                        <div className="flex gap-2 mt-0.5">
                          {stats.pending > 0 && (
                            <span className="text-yellow-400">{stats.pending} pending</span>
                          )}
                          {stats.running > 0 && (
                            <span className="text-blue-400">{stats.running} running</span>
                          )}
                          {stats.failed > 0 && (
                            <span className="text-red-400">{stats.failed} failed</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <SStatusPill kind={pillKind}>{pillText}</SStatusPill>
                    </div>
                    <div>
                      <SButton
                        variant="ghost"
                        small
                        onClick={() => handleTrigger(cron.name)}
                        disabled={triggering === cron.name}
                      >
                        {triggering === cron.name ? "Queuing..." : "Run now"}
                      </SButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {data?.recentJobs && data.recentJobs.length > 0 && (
          <>
            <SDivider label="Recent history" />
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Job</th>
                    <th className="pb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Status</th>
                    <th className="pb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Started</th>
                    <th className="pb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {data.recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="py-2 px-2 text-zinc-100 text-sm">{formatJobName(job.name)}</td>
                      <td className="py-2 px-2">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="py-2 px-2 text-zinc-400 text-xs font-mono">
                        {formatDate(job.started_at)}
                      </td>
                      <td className="py-2 px-2 text-zinc-400 text-xs font-mono">
                        {formatDate(job.completed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </SCard>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const kindMap: Record<string, "ok" | "amber" | "neutral" | "error"> = {
    pending: "amber",
    running: "amber",
    completed: "ok",
    failed: "error",
  };
  return (
    <SStatusPill kind={kindMap[status] ?? "neutral"}>{status}</SStatusPill>
  );
}

function AdminSection() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    api.getAdminSettings().then((data) => {
      setSettings(data);
      setIssuerUrl(data.oidc.issuer_url.source !== "env" ? data.oidc.issuer_url.value : "");
      setClientId(data.oidc.client_id.source !== "env" ? data.oidc.client_id.value : "");
      setClientSecret("");
      setRedirectUri(
        data.oidc.redirect_uri.source !== "env"
          ? data.oidc.redirect_uri.value || `${window.location.origin}/api/auth/oidc/callback`
          : ""
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setSaving(true);
    try {
      const body: Record<string, string> = {
        oidc_issuer_url: issuerUrl,
        oidc_client_id: clientId,
        oidc_redirect_uri: redirectUri,
      };
      if (clientSecret) {
        body.oidc_client_secret = clientSecret;
      }
      const result = await api.updateAdminSettings(body);
      setMsg(result.oidc_configured ? "OIDC configured successfully" : "Settings saved");
      const data = await api.getAdminSettings();
      setSettings(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SCard title="Admin settings" subtitle="Server and user management">
        <div className="text-zinc-500 text-sm">Loading settings...</div>
      </SCard>
    );
  }

  return (
    <SCard
      title="OpenID Connect"
      subtitle="Configure OIDC to enable SSO login. Values already set via environment variable are locked."
      action={
        <div className="flex items-center gap-2">
          <SStatusPill kind={settings?.oidc_configured ? "ok" : "neutral"}>
            {settings?.oidc_configured ? "Configured" : "Not configured"}
          </SStatusPill>
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-white/[0.06] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            Manage users →
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-3.5">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        <SettingField
          label="Issuer URL"
          value={issuerUrl}
          onChange={setIssuerUrl}
          placeholder="https://auth.example.com"
          source={settings?.oidc.issuer_url.source}
          envValue={settings?.oidc.issuer_url.source === "env" ? settings.oidc.issuer_url.value : undefined}
        />
        <SettingField
          label="Client ID"
          value={clientId}
          onChange={setClientId}
          placeholder="my-client-id"
          source={settings?.oidc.client_id.source}
          envValue={settings?.oidc.client_id.source === "env" ? settings.oidc.client_id.value : undefined}
        />
        <SettingField
          label="Client Secret"
          value={clientSecret}
          onChange={setClientSecret}
          placeholder={settings?.oidc.client_secret.source !== "unset" ? "••••••••  (leave blank to keep)" : ""}
          type="password"
          source={settings?.oidc.client_secret.source}
          envValue={settings?.oidc.client_secret.source === "env" ? "********" : undefined}
        />
        <SettingField
          label="Redirect URI"
          value={redirectUri}
          onChange={setRedirectUri}
          placeholder={`${window.location.origin}/api/auth/oidc/callback`}
          source={settings?.oidc.redirect_uri.source}
          envValue={settings?.oidc.redirect_uri.source === "env" ? settings.oidc.redirect_uri.value : undefined}
        />

        <div>
          <SButton type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save OIDC settings"}
          </SButton>
        </div>
      </form>
    </SCard>
  );
}

function SettingField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  source,
  envValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  source?: string;
  envValue?: string;
}) {
  const isEnv = source === "env";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <SLabel>{label}</SLabel>
        {isEnv && <SStatusPill kind="amber">ENV</SStatusPill>}
      </div>
      {isEnv ? (
        <div className="px-3 py-2.5 bg-zinc-800/50 border border-white/[0.08] rounded-lg text-zinc-400 text-[13px]">
          {envValue} <span className="text-zinc-600">(set via environment variable)</span>
        </div>
      ) : (
        <SInput
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

