import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type { Notifier } from "../../api";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "../../lib/push";
import {
  SCard,
  SFormRow,
  SSwitch,
  SRadioCard,
  SStatusPill,
  SDivider,
  SKeyValue,
  SButton,
  SInput,
  SLabel,
  SMessage,
} from "../../components/settings/kit";
import { cn } from "@/lib/utils";

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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [{ notifiers }, subscription] = await Promise.all([
        api.getNotifiers(signal),
        getExistingSubscription(),
      ]);
      if (signal?.aborted) return;
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
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
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

  const refresh = useCallback((signal?: AbortSignal) => {
    Promise.all([api.getNotifiers(signal), api.getNotifierProviders(signal)])
      .then(([n, p]) => {
        if (signal?.aborted) return;
        setNotifiers(n.notifiers.filter((x) => x.provider !== "webpush"));
        setProviders(p.providers.filter((x) => x !== "webpush"));
        setLoading(false);
      })
      .catch(() => { if (!signal?.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
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

export default function NotificationsTab() {
  return (
    <>
      {isPushSupported() && <PushNotificationsSection />}
      <NotificationsSection />
    </>
  );
}
