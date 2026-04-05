import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
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

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t("settings.title")}</h1>
        <Link to={`/user/${user.username}`} className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
          {t("settings.viewProfile")}
        </Link>
      </div>
      <UserSection />
      <PasskeySection />
      <ProfileVisibilitySection />
      <SocialSection />
      <WatchlistSection />
      {isPushSupported() && <PushNotificationsSection />}
      <HomepageLayoutSection />
      <CalendarFeedSection />
      <PlexSection />
      <NotificationsSection />
      {user.is_admin && <BackgroundJobsSection />}
      {user.is_admin && <AdminSection />}
    </div>
  );
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

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">{t("profile.title")}</h2>

      {user && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">{t("profile.changePassword")}</h3>
          <form onSubmit={handleChangePassword} className="bg-zinc-900 rounded-lg p-5 space-y-4">
            {passwordMsg && (
              <div className="p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
                {passwordMsg}
              </div>
            )}
            {passwordErr && (
              <div className="p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
                {passwordErr}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{t("profile.currentPassword")}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{t("profile.newPassword")}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? t("profile.changing") : t("profile.changePassword")}
            </button>
          </form>
        </div>
      )}

      {SUPPORTED_LANGUAGES.length > 1 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-3">{t("profile.language")}</h3>
          <div className="bg-zinc-900 rounded-lg p-5">
            <div className="flex gap-2 flex-wrap">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer bg-zinc-700 text-white hover:bg-amber-500 hover:text-zinc-950"
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
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
    <section>
      <h2 className="text-xl font-bold text-white mb-4">{t("profile.passkeys")}</h2>
      <div className="bg-zinc-900 rounded-lg p-5 space-y-4">
        {msg && (
          <div className="p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
            {msg}
          </div>
        )}
        {err && (
          <div className="p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
            {err}
          </div>
        )}

        {loading ? (
          <p className="text-zinc-400 text-sm">{t("common.loading")}</p>
        ) : (
          <>
            {passkeys.length === 0 ? (
              <p className="text-zinc-400 text-sm">{t("profile.noPasskeys")}</p>
            ) : (
              <ul className="space-y-2">
                {passkeys.map((pk) => (
                  <li key={pk.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                    {editing === pk.id ? (
                      <form
                        className="flex items-center gap-2 flex-1 mr-2"
                        onSubmit={(e) => { e.preventDefault(); handleRenamePasskey(pk.id); }}
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 bg-zinc-700 border border-white/[0.08] rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="text-amber-400 hover:text-amber-300 text-sm cursor-pointer"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditing(null); setEditName(""); }}
                          className="text-zinc-400 hover:text-zinc-300 text-sm cursor-pointer"
                        >
                          {t("common.cancel")}
                        </button>
                      </form>
                    ) : (
                      <>
                        <div>
                          <span className="text-white text-sm font-medium">
                            {pk.name || t("profile.passkeyUnnamed")}
                          </span>
                          {pk.createdAt && (
                            <span className="text-zinc-500 text-xs ml-2">
                              {new Date(pk.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setEditing(pk.id); setEditName(pk.name || ""); }}
                            className="text-zinc-400 hover:text-zinc-300 text-sm transition-colors cursor-pointer"
                          >
                            {t("profile.renamePasskey")}
                          </button>
                          <button
                            onClick={() => handleDeletePasskey(pk.id)}
                            disabled={deleting === pk.id}
                            className="text-red-400 hover:text-red-300 text-sm transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {deleting === pk.id ? t("profile.deletingPasskey") : t("profile.deletePasskey")}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 items-end pt-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-300 mb-1">{t("profile.passkeyName")}</label>
                <input
                  type="text"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  placeholder={t("profile.passkeyNamePlaceholder")}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleAddPasskey}
                disabled={adding}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {adding ? t("profile.addingPasskey") : t("profile.addPasskey")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
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
      setTitles((prev) => prev.map((t) => ({ ...t, public: isPublic })));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingAll(false);
    }
  }

  if (loading) return <div className="text-zinc-500">{t("common.loading")}</div>;

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">{t("settings.profileVisibility")}</h2>

      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
          {err}
        </div>
      )}

      <div className="bg-zinc-900 rounded-lg p-5 space-y-4">
        {/* Visibility selector */}
        <div className="space-y-3" data-testid="visibility-selector">
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                visibility === option
                  ? "bg-amber-500/10 border border-amber-500/30"
                  : "bg-zinc-800 border border-transparent hover:bg-zinc-700"
              } ${updatingGlobal ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input
                type="radio"
                name="profile-visibility"
                value={option}
                checked={visibility === option}
                onChange={() => handleVisibilityChange(option)}
                disabled={updatingGlobal}
                className="accent-amber-500"
              />
              <div>
                <p className={`font-medium ${visibility === option ? "text-amber-400" : "text-white"}`}>
                  {t(`settings.visibility_${option}`)}
                </p>
                <p className="text-sm text-zinc-400">{t(`settings.visibility_${option}_desc`)}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Bulk actions */}
        {titles.length > 0 && (
          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
            <span className="text-sm text-zinc-400 mr-auto">{t("settings.perTitleVisibility")}</span>
            <button
              onClick={() => handleBulkVisibility(true)}
              disabled={updatingAll}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {t("settings.showAll")}
            </button>
            <button
              onClick={() => handleBulkVisibility(false)}
              disabled={updatingAll}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {t("settings.hideAll")}
            </button>
          </div>
        )}

        {titles.length === 0 && (
          <p className="text-zinc-500 text-sm">{t("settings.noTrackedTitles")}</p>
        )}
      </div>
    </section>
  );
}

function SocialSection() {
  const { t } = useTranslation();

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Social</h2>
      <div className="bg-zinc-900 rounded-lg p-5">
        <Link
          to="/invite"
          className="flex items-center gap-3 text-amber-500 hover:text-amber-400 transition-colors font-medium"
        >
          <UserPlus className="size-5" />
          {t("invite.settingsLink")}
        </Link>
      </div>
    </section>
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
    <section>
      <h2 className="text-xl font-bold text-white mb-4">{t("profile.watchlist")}</h2>

      {msg && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
          {msg}
        </div>
      )}
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
          {err}
        </div>
      )}

      <div className="bg-zinc-900 rounded-lg p-5 space-y-4">
        <div>
          <p className="text-white font-medium mb-1">{t("profile.exportWatchlist")}</p>
          <p className="text-sm text-zinc-400 mb-3">{t("profile.exportDescription")}</p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {exporting ? t("profile.exporting") : t("profile.export")}
          </button>
        </div>

        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-white font-medium mb-1">{t("profile.importWatchlist")}</p>
          <p className="text-sm text-zinc-400 mb-3">{t("profile.importDescription")}</p>
          <label className={`px-4 py-2 bg-zinc-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
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
    </section>
  );
}

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

      // Auto-cleanup stale states
      if (webpushNotifier && !webpushNotifier.enabled) {
        // Background job disabled it (expired subscription) — clean up
        try { await unsubscribeFromPush(); } catch { /* ignore */ }
        try { await api.deleteNotifier(webpushNotifier.id); } catch { /* ignore */ }
        setPushNotifier(null);
        setHasSubscription(false);
        setErr("Push subscription expired. Please re-enable push notifications.");
      } else if (webpushNotifier && !subscription) {
        // DB record exists but browser has no subscription — stale
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

      // Verify the subscription actually works by sending a test push
      const testResult = await api.testNotifier(notifier.id);
      if (!testResult.success && testResult.message.toLowerCase().includes("subscription expired")) {
        // Fresh subscription is already invalid — clean up
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
        // Auto-cleanup expired subscription
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

  if (loading) return <div className="text-zinc-500">{t("profile.loadingPushStatus")}</div>;

  const isEnabled = !!pushNotifier && pushNotifier.enabled && hasSubscription;
  const isDenied = permissionState === "denied";

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">{t("profile.pushNotifications")}</h2>

      {msg && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
          {msg}
        </div>
      )}
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
          {err}
        </div>
      )}

      <div className="bg-zinc-900 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">
              {isEnabled ? "Push notifications are enabled" : "Get notified about new releases"}
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              {isEnabled
                ? "You'll receive notifications on this device"
                : isDenied
                  ? "Notifications are blocked. Enable them in your browser settings."
                  : "Receive native push notifications for new episodes and movies"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEnabled ? (
              <>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testing ? t("profile.testing") : t("profile.testPush")}
                </button>
                <button
                  onClick={handleDisable}
                  disabled={disabling}
                  className="px-3 py-1.5 text-sm bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {disabling ? t("profile.disabling") : t("profile.disablePush")}
                </button>
              </>
            ) : (
              <button
                onClick={handleEnable}
                disabled={enabling || isDenied}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {enabling ? t("profile.enabling") : t("profile.enablePush")}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
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

  // Form fields
  const [formProvider, setFormProvider] = useState("discord");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formBotToken, setFormBotToken] = useState("");
  const [formChatId, setFormChatId] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formTimezone, setFormTimezone] = useState(USER_TIMEZONE);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([api.getNotifiers(), api.getNotifierProviders()])
      .then(([n, p]) => {
        // Hide webpush from manual notifier list — it's managed via PushNotificationsSection
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

    try {
      if (editingId) {
        await api.updateNotifier(editingId, {
          config,
          notify_time: formTime,
          timezone: formTimezone,
        });
        setMsg("Notifier updated");
      } else {
        await api.createNotifier({
          provider: formProvider,
          config,
          notify_time: formTime,
          timezone: formTimezone,
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

  if (loading) return <div className="text-zinc-500">Loading notifications...</div>;

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Notifications</h2>

      {msg && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
          {msg}
        </div>
      )}
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
          {err}
        </div>
      )}

      {/* Existing notifiers */}
      {notifiers.length > 0 && (
        <div className="space-y-3 mb-4">
          {notifiers.map((n) => (
            <div
              key={n.id}
              className="bg-zinc-900 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium capitalize">{n.provider}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      n.enabled
                        ? "bg-green-900/50 text-green-300"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {n.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(n)}
                    disabled={toggling === n.id}
                    className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {toggling === n.id ? "..." : n.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleTest(n.id)}
                    disabled={testing === n.id}
                    className="px-2 py-1 text-xs bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {testing === n.id ? "Sending..." : "Test"}
                  </button>
                  <button
                    onClick={() => startEdit(n)}
                    className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-xs text-zinc-400 space-y-0.5">
                <div>
                  Time: <span className="text-zinc-300">{n.notify_time}</span>{" "}
                  <span className="text-zinc-500">({n.timezone})</span>
                </div>
                {n.last_sent_date && (
                  <div>Last sent: {n.last_sent_date}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <form onSubmit={handleSave} className="bg-zinc-900 rounded-lg p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">
            {editingId ? "Edit Notifier" : "Add Notifier"}
          </h3>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Provider</label>
            <select
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value)}
              disabled={!!editingId}
              className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {formProvider === "discord" && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Webhook URL</label>
              <input
                type="url"
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required
              />
            </div>
          )}

          {(formProvider === "ntfy" || formProvider === "webhook" || formProvider === "gotify") && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {formProvider === "ntfy" ? "Topic URL (e.g. https://ntfy.sh/my-topic)" : formProvider === "gotify" ? "Server URL (e.g. https://gotify.example.com)" : "Webhook URL"}
              </label>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder={formProvider === "ntfy" ? "https://ntfy.sh/my-topic" : formProvider === "gotify" ? "https://gotify.example.com" : "https://your-server.com/hook"}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required
              />
            </div>
          )}

          {(formProvider === "ntfy" || formProvider === "gotify") && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {formProvider === "gotify" ? "Application Token" : "Access Token"}{formProvider === "ntfy" ? " (optional)" : ""}
              </label>
              <input
                type="password"
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder={formProvider === "gotify" ? "App token from Gotify" : "Bearer token (leave empty for public topics)"}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required={formProvider === "gotify"}
              />
            </div>
          )}

          {formProvider === "webhook" && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Signing Secret <span className="text-zinc-500">(optional — enables HMAC-SHA256 signature header)</span></label>
              <input
                type="password"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
                placeholder="Leave empty to skip request signing"
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
              />
            </div>
          )}

          {formProvider === "telegram" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Bot Token</label>
                <input
                  type="password"
                  value={formBotToken}
                  onChange={(e) => setFormBotToken(e.target.value)}
                  placeholder="123456789:ABCdef..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Chat ID</label>
                <input
                  type="text"
                  value={formChatId}
                  onChange={(e) => setFormChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                  required
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Notification Time</label>
              <input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Timezone</label>
              <input
                type="text"
                value={formTimezone}
                onChange={(e) => setFormTimezone(e.target.value)}
                list="timezone-list"
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                required
              />
              <datalist id="timezone-list">
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => { resetForm(); setShowForm(true); setMsg(""); setErr(""); }}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors cursor-pointer"
        >
          Add Notifier
        </button>
      )}
    </section>
  );
}

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

  if (loading) return <div className="text-zinc-500">Loading jobs...</div>;

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Background Jobs</h2>

      {msg && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
          {msg}
        </div>
      )}
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
          {err}
        </div>
      )}

      {/* Cron Schedules */}
      <div className="bg-zinc-900 rounded-lg p-5 mb-4">
        <h3 className="text-lg font-semibold text-white mb-3">Scheduled Jobs</h3>
        {data?.crons.length === 0 && (
          <p className="text-zinc-500 text-sm">No scheduled jobs configured.</p>
        )}
        <div className="space-y-3">
          {data?.crons.map((cron) => {
            const stats = data.stats[cron.name];
            const isRunning = stats?.running > 0;
            return (
              <div
                key={cron.name}
                className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {formatJobName(cron.name)}
                    </span>
                    {isRunning && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-900/50 text-blue-300">
                        Running
                      </span>
                    )}
                    {!cron.enabled && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700 text-zinc-400">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 space-y-0.5">
                    <div>
                      Schedule: <code className="text-zinc-300">{cron.cron}</code>
                    </div>
                    <div>Last run: {formatDate(cron.last_run)}</div>
                    <div>Next run: {formatDate(cron.next_run)}</div>
                    {stats && (
                      <div className="flex gap-3 mt-1">
                        <span className="text-yellow-400">{stats.pending} pending</span>
                        <span className="text-blue-400">{stats.running} running</span>
                        <span className="text-green-400">{stats.completed} completed</span>
                        {stats.failed > 0 && (
                          <span className="text-red-400">{stats.failed} failed</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleTrigger(cron.name)}
                  disabled={triggering === cron.name}
                  className="ml-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {triggering === cron.name ? "Queuing..." : "Run Now"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Job History */}
      {data?.recentJobs && data.recentJobs.length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-white mb-3">Recent History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 text-left border-b border-white/[0.06]">
                  <th className="pb-2 font-medium">Job</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Started</th>
                  <th className="pb-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="py-2 text-white">{formatJobName(job.name)}</td>
                    <td className="py-2">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="py-2 text-zinc-400 text-xs">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="py-2 text-zinc-400 text-xs">
                      {formatDate(job.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-900/50 text-yellow-300",
    running: "bg-blue-900/50 text-blue-300",
    completed: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || "bg-zinc-700 text-zinc-400"}`}
    >
      {status}
    </span>
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
      setClientSecret(""); // Never prefill secrets
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
      // Only send client_secret if changed
      if (clientSecret) {
        body.oidc_client_secret = clientSecret;
      }
      const result = await api.updateAdminSettings(body);
      setMsg(result.oidc_configured ? "OIDC configured successfully" : "Settings saved");
      // Refresh settings
      const data = await api.getAdminSettings();
      setSettings(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-zinc-500">Loading settings...</div>;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Admin Settings</h2>
        <Link to="/admin/users" className="text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors border border-white/[0.06]">
          Manage Users →
        </Link>
      </div>

      <div className="bg-zinc-900 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">OpenID Connect</h3>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              settings?.oidc_configured
                ? "bg-green-900/50 text-green-300"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {settings?.oidc_configured ? "Configured" : "Not configured"}
          </span>
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
            {msg}
          </div>
        )}
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
            {err}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
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

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save OIDC Settings"}
          </button>
        </form>
      </div>
    </section>
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
      <div className="flex items-center gap-2 mb-1">
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
        {isEnv && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/50 text-amber-300">
            ENV
          </span>
        )}
      </div>
      {isEnv ? (
        <div className="px-3 py-2 bg-zinc-800/50 border border-white/[0.08] rounded-lg text-zinc-400 text-sm">
          {envValue} <span className="text-zinc-600">(set via environment variable)</span>
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
        />
      )}
    </div>
  );
}

// ─── Plex Integration ────────────────────────────────────────────────────────

type ConnectStep =
  | { type: "idle" }
  | { type: "waiting"; pinId: number; authUrl: string }
  | { type: "pick_server"; authToken: string; servers: PlexServer[] };

const PLEX_POPUP_FEATURES = "width=800,height=700,menubar=no,toolbar=no,location=no,status=no";
const PIN_POLL_INTERVAL_MS = 2000;

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
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("settings.homepage.title")}</h2>
      <p className="text-sm text-zinc-400 mb-4">{t("settings.homepage.description")}</p>
      <div className="space-y-2">
        {layout.map((section, index) => (
          <div
            key={section.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            className="flex items-center gap-3 bg-zinc-900 border border-white/[0.06] rounded-lg px-4 py-3 cursor-grab active:cursor-grabbing select-none"
          >
            <GripVertical size={16} className="text-zinc-500 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 text-sm text-zinc-100">{t(SECTION_LABELS[section.id] ?? section.id)}</span>
            <button
              onClick={() => toggleEnabled(section.id)}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              aria-label={section.enabled ? t("settings.homepage.hideSection") : t("settings.homepage.showSection")}
            >
              {section.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        ))}
      </div>
      {saved && <p className="text-xs text-emerald-400 mt-2">{t("settings.homepage.saved")}</p>}
      {saving && <p className="text-xs text-zinc-400 mt-2">{t("settings.homepage.saving")}</p>}
    </section>
  );
}

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

  // Server picker form state
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

  // Auto-poll PIN status while waiting
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
        // Re-select current server if it still exists, otherwise pick first
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
    <section>
      <h2 className="text-xl font-bold text-white mb-1">Plex</h2>
      <p className="text-zinc-400 text-sm mb-4">Connect your Plex server to automatically sync your watched history.</p>

      {msg && (
        <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">{msg}</div>
      )}
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">{err}</div>
      )}

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3 mb-4">
          {integrations.map((integration) => (
            <div key={integration.id} className="bg-zinc-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{integration.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    integration.enabled ? "bg-green-900/50 text-green-300" : "bg-zinc-700 text-zinc-400"
                  }`}>
                    {integration.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(integration)}
                    disabled={toggling === integration.id}
                    className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {toggling === integration.id ? "..." : integration.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleSync(integration.id)}
                    disabled={syncing === integration.id || !integration.enabled}
                    className="text-xs text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {syncing === integration.id ? "Syncing..." : "Sync now"}
                  </button>
                  <button
                    onClick={() => handleDelete(integration.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="text-xs text-zinc-500 space-y-0.5">
                <div>Server: <span className="text-zinc-400">{integration.config.serverUrl}</span></div>
                <div>Last sync: <span className="text-zinc-400">{formatSyncTime(integration.last_sync_at)}</span></div>
                {integration.last_sync_error && (
                  <div className="text-red-400">Error: {integration.last_sync_error}</div>
                )}
                <div className="flex gap-3 mt-1">
                  <span className={integration.config.syncMovies ? "text-zinc-400" : "text-zinc-600"}>Movies</span>
                  <span className={integration.config.syncEpisodes ? "text-zinc-400" : "text-zinc-600"}>Episodes</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect flow */}
      {step.type === "idle" && (
        <button
          onClick={handleConnect}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg text-sm transition-colors cursor-pointer"
        >
          Connect Plex
        </button>
      )}

      {step.type === "waiting" && (
        <div className="bg-zinc-900 rounded-lg p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            Waiting for authorization&hellip; Sign in and authorize Remindarr in the Plex popup.
          </p>
          <p className="text-xs text-zinc-500">
            Popup blocked?{" "}
            <a href={step.authUrl} target="plex_auth" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400">
              Open authorization page
            </a>
          </p>
          <button
            onClick={handleCancelConnect}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {step.type === "pick_server" && (
        <div className="bg-zinc-900 rounded-lg p-4 space-y-4">
          <h3 className="text-white font-medium">Select a Plex server</h3>

          {/* Server selection */}
          <div className="space-y-2">
            {step.servers.map((server) => (
              <label key={server.clientIdentifier} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="plex_server"
                  checked={selectedServer?.clientIdentifier === server.clientIdentifier}
                  onChange={() => selectServer(server)}
                  className="accent-amber-500"
                />
                <span className="text-white text-sm">{server.name}</span>
              </label>
            ))}
          </div>

          {/* Connection URL */}
          {selectedServer && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-zinc-400">Connection URL</label>
                <button
                  onClick={handleRefreshServers}
                  disabled={refreshingServers}
                  className="text-xs text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {refreshingServers ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <select
                value={selectedUri}
                onChange={(e) => setSelectedUri(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {selectedServer.connections.map((conn) => (
                  <option key={conn.uri} value={conn.uri}>
                    {conn.uri}{conn.local ? " (local)" : conn.relay ? " (relay)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sync options */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2">Sync options</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={syncMovies}
                  onChange={(e) => setSyncMovies(e.target.checked)}
                  className="accent-amber-500"
                />
                Sync watched movies
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={syncEpisodes}
                  onChange={(e) => setSyncEpisodes(e.target.checked)}
                  className="accent-amber-500"
                />
                Sync watched episodes
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveServer}
              disabled={saving || !selectedServer || !selectedUri}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Connecting..." : "Connect"}
            </button>
            <button
              onClick={handleCancelConnect}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
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
    <section className="bg-zinc-900 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold">{t("feed.title")}</h2>
      <p className="text-sm text-zinc-400">{t("feed.description")}</p>
      {loadingToken ? (
        <p className="text-sm text-zinc-500">{t("common.loading")}</p>
      ) : token ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={feedUrl!}
              readOnly
              aria-label={t("feed.title")}
              className="flex-1 min-w-0 bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? t("feed.copied") : t("feed.copyUrl")}
            </button>
          </div>
          <p className="text-xs text-zinc-500">{t("feed.warning")}</p>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {regenerating ? t("feed.regenerating") : t("feed.regenerate")}
          </button>
        </div>
      ) : (
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {regenerating ? t("feed.generating") : t("feed.generate")}
        </button>
      )}
    </section>
  );
}
