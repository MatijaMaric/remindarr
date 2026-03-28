import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { JobsResponse, Notifier } from "../api";
import type { AdminSettings, Title } from "../types";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "../lib/push";
import { authClient } from "../lib/auth-client";

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t("settings.title")}</h1>
        <Link to={`/user/${user.username}`} className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
          {t("settings.viewProfile")}
        </Link>
      </div>
      <UserSection />
      <PasskeySection />
      <ProfileVisibilitySection />
      <WatchlistSection />
      {isPushSupported() && <PushNotificationsSection />}
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

function ProfileVisibilitySection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [profilePublic, setProfilePublic] = useState(false);
  const [titles, setTitles] = useState<(Title & { public: boolean })[]>([]);
  const [updatingGlobal, setUpdatingGlobal] = useState(false);
  const [updatingTitle, setUpdatingTitle] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.getTrackedTitles();
      setProfilePublic(data.profile_public);
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

  async function handleGlobalToggle() {
    setErr("");
    setUpdatingGlobal(true);
    try {
      const newValue = !profilePublic;
      await api.updateProfileVisibility(newValue);
      setProfilePublic(newValue);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingGlobal(false);
    }
  }

  async function handleTitleToggle(titleId: string, currentPublic: boolean) {
    setErr("");
    setUpdatingTitle(titleId);
    try {
      await api.updateTitleVisibility(titleId, !currentPublic);
      setTitles((prev) =>
        prev.map((t) => (t.id === titleId ? { ...t, public: !currentPublic } : t))
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingTitle(null);
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
        {/* Global toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-white font-medium">{t("settings.showWatchlistOnProfile")}</p>
            <p className="text-sm text-zinc-400 mt-1">{t("settings.showWatchlistDescription")}</p>
          </div>
          <button
            onClick={handleGlobalToggle}
            disabled={updatingGlobal}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              profilePublic ? "bg-amber-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                profilePublic ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
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

        {/* Per-title list */}
        {titles.length > 0 && (
          <div className={`space-y-1 ${!profilePublic ? "opacity-50" : ""}`}>
            {titles.map((title) => (
              <div
                key={title.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                {title.poster_url ? (
                  <img
                    src={title.poster_url}
                    alt={title.title}
                    className="w-8 h-12 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-12 rounded bg-zinc-800 shrink-0" />
                )}
                <span className="text-white text-sm flex-1 min-w-0 truncate">{title.title}</span>
                <button
                  onClick={() => handleTitleToggle(title.id, title.public)}
                  disabled={updatingTitle === title.id}
                  className="shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 hover:bg-zinc-700"
                  title={title.public ? t("settings.hideTitle") : t("settings.showTitle")}
                >
                  {title.public ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {titles.length === 0 && (
          <p className="text-zinc-500 text-sm">{t("settings.noTrackedTitles")}</p>
        )}
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
    setFormTime("09:00");
    setFormTimezone(USER_TIMEZONE);
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(n: Notifier) {
    setEditingId(n.id);
    setFormProvider(n.provider);
    setFormWebhookUrl(n.config.webhookUrl || "");
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
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Admin Settings</h2>

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
