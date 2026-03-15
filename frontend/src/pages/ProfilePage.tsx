import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { JobsResponse, Notifier } from "../api";
import type { AdminSettings } from "../types";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "../lib/push";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <UserSection />
      {isPushSupported() && <PushNotificationsSection />}
      <NotificationsSection />
      {user.is_admin && <BackgroundJobsSection />}
      {user.is_admin && <AdminSection />}
    </div>
  );
}

function UserSection() {
  const { user } = useAuth();

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
      await api.changePassword(currentPassword, newPassword);
      setPasswordMsg("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Profile</h2>
      <div className="bg-gray-900 rounded-lg p-5 space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Username</span>
          <span className="text-white">{user?.username}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Display Name</span>
          <span className="text-white">{user?.display_name || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Auth Provider</span>
          <span className="text-white capitalize">{user?.auth_provider}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span className="text-white">{user?.is_admin ? "Admin" : "User"}</span>
        </div>
      </div>

      {user?.auth_provider === "local" && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-3">Change Password</h3>
          <form onSubmit={handleChangePassword} className="bg-gray-900 rounded-lg p-5 space-y-4">
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      )}
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
      setPushNotifier(webpushNotifier);
      setHasSubscription(!!subscription);
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

      await api.createNotifier({
        provider: "webpush",
        config: subscription,
        notify_time: "09:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setMsg("Push notifications enabled");
      await refresh();
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
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
      } else {
        setErr(result.message);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading push notification status...</div>;

  const isEnabled = !!pushNotifier && pushNotifier.enabled && hasSubscription;
  const isDenied = permissionState === "denied";

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Push Notifications</h2>

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

      <div className="bg-gray-900 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">
              {isEnabled ? "Push notifications are enabled" : "Get notified about new releases"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
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
                  className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testing ? "Sending..." : "Test"}
                </button>
                <button
                  onClick={handleDisable}
                  disabled={disabling}
                  className="px-3 py-1.5 text-sm bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {disabling ? "Disabling..." : "Disable"}
                </button>
              </>
            ) : (
              <button
                onClick={handleEnable}
                disabled={enabling || isDenied}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {enabling ? "Enabling..." : "Enable"}
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
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setToggling(null);
    }
  }

  if (loading) return <div className="text-gray-500">Loading notifications...</div>;

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
              className="bg-gray-900 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium capitalize">{n.provider}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      n.enabled
                        ? "bg-green-900/50 text-green-300"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {n.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(n)}
                    disabled={toggling === n.id}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {toggling === n.id ? "..." : n.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleTest(n.id)}
                    disabled={testing === n.id}
                    className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {testing === n.id ? "Sending..." : "Test"}
                  </button>
                  <button
                    onClick={() => startEdit(n)}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors cursor-pointer"
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
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>
                  Time: <span className="text-gray-300">{n.notify_time}</span>{" "}
                  <span className="text-gray-500">({n.timezone})</span>
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
        <form onSubmit={handleSave} className="bg-gray-900 rounded-lg p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">
            {editingId ? "Edit Notifier" : "Add Notifier"}
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Provider</label>
            <select
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value)}
              disabled={!!editingId}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL</label>
              <input
                type="url"
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Notification Time</label>
              <input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Timezone</label>
              <input
                type="text"
                value={formTimezone}
                onChange={(e) => setFormTimezone(e.target.value)}
                list="timezone-list"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => { resetForm(); setShowForm(true); setMsg(""); setErr(""); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors cursor-pointer"
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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTriggering(null);
    }
  }

  if (loading) return <div className="text-gray-500">Loading jobs...</div>;

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
      <div className="bg-gray-900 rounded-lg p-5 mb-4">
        <h3 className="text-lg font-semibold text-white mb-3">Scheduled Jobs</h3>
        {data?.crons.length === 0 && (
          <p className="text-gray-500 text-sm">No scheduled jobs configured.</p>
        )}
        <div className="space-y-3">
          {data?.crons.map((cron) => {
            const stats = data.stats[cron.name];
            const isRunning = stats?.running > 0;
            return (
              <div
                key={cron.name}
                className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
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
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-400">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                    <div>
                      Schedule: <code className="text-gray-300">{cron.cron}</code>
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
                  className="ml-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
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
        <div className="bg-gray-900 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-white mb-3">Recent History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Job</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Started</th>
                  <th className="pb-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="py-2 text-white">{formatJobName(job.name)}</td>
                    <td className="py-2">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
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
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || "bg-gray-700 text-gray-400"}`}
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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading settings...</div>;

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Admin Settings</h2>

      <div className="bg-gray-900 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">OpenID Connect</h3>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              settings?.oidc_configured
                ? "bg-green-900/50 text-green-300"
                : "bg-gray-800 text-gray-400"
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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
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
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        {isEnv && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/50 text-amber-300">
            ENV
          </span>
        )}
      </div>
      {isEnv ? (
        <div className="px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 text-sm">
          {envValue} <span className="text-gray-600">(set via environment variable)</span>
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      )}
    </div>
  );
}
