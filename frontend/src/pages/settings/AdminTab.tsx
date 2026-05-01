import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import * as api from "../../api";
import type { JobsResponse, AdminConfigResponse, AdminLogEntry } from "../../api";
import type { AdminSettings } from "../../types";
import {
  SCard,
  SStatusPill,
  SDivider,
  SButton,
  SInput,
  SLabel,
  SMessage,
} from "../../components/settings/kit";

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

function BackgroundJobsSection() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback((signal?: AbortSignal) => {
    api.getJobs(signal).then((d) => {
      if (signal?.aborted) return;
      setData(d);
      setLoading(false);
    }).catch(() => { if (!signal?.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const interval = setInterval(() => refresh(), 15000);
    return () => { controller.abort(); clearInterval(interval); };
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
    const controller = new AbortController();
    api.getAdminSettings(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
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
    }).catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
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

function RuntimeConfigSection() {
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api.getAdminConfig(controller.signal)
      .then((d) => { if (!controller.signal.aborted) { setConfig(d); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return (
    <SCard title="Runtime configuration" subtitle="Current server config. Secret values show only whether they are set.">
      {loading && <div className="text-zinc-500 text-sm">Loading...</div>}
      {config && (
        <div className="space-y-4">
          <div>
            <div className="grid grid-cols-[1fr_1fr_80px] gap-2 px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <div>Key</div><div>Value</div><div>Source</div>
            </div>
            <div className="space-y-0.5">
              {config.safe.map((entry) => (
                <div key={entry.key} className="grid grid-cols-[1fr_1fr_80px] gap-2 px-2 py-1.5 bg-zinc-800/60 rounded text-sm font-mono">
                  <span className="text-zinc-300 truncate">{entry.key}</span>
                  <span className="text-zinc-400 truncate">{String(entry.value) || <span className="text-zinc-600 italic">empty</span>}</span>
                  <SStatusPill kind={entry.source === "env" ? "amber" : "neutral"}>{entry.source}</SStatusPill>
                </div>
              ))}
            </div>
          </div>
          {config.secrets.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 px-2 pb-1">Secrets</div>
              <div className="space-y-0.5">
                {config.secrets.map((entry) => (
                  <div key={entry.key} className="grid grid-cols-[1fr_1fr_80px] gap-2 px-2 py-1.5 bg-zinc-800/60 rounded text-sm font-mono">
                    <span className="text-zinc-300 truncate">{entry.key}</span>
                    <span className="text-zinc-600 italic">
                      {entry.source === "env" ? "•••••• (set)" : "not set"}
                    </span>
                    <SStatusPill kind={entry.source === "env" ? "ok" : "neutral"}>{entry.source}</SStatusPill>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SCard>
  );
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: "text-zinc-500",
  info: "text-zinc-300",
  warn: "text-yellow-400",
  error: "text-red-400",
};

function LogTailSection() {
  const [entries, setEntries] = useState<AdminLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback((signal?: AbortSignal) => {
    api.getAdminLogs({ limit: 50, level: levelFilter || undefined }, signal)
      .then((d) => { if (!signal?.aborted) { setEntries(d.entries); setLoading(false); } })
      .catch(() => { if (!signal?.aborted) setLoading(false); });
  }, [levelFilter]);

  // Initial load + polling. Loading state resets via fetchLogs callback results.
  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    intervalRef.current = setInterval(() => fetchLogs(), 5000);
    return () => { controller.abort(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLogs]);

  return (
    <SCard
      title="Server logs"
      subtitle="Last 50 log entries from this server instance. Auto-refreshes every 5 seconds."
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["", "debug", "info", "warn", "error"] as const).map((lvl) => (
            <button
              key={lvl || "all"}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                levelFilter === lvl
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {lvl || "all"}
            </button>
          ))}
        </div>
        {loading && <div className="text-zinc-500 text-sm">Loading logs...</div>}
        {!loading && entries.length === 0 && (
          <div className="text-zinc-600 text-sm font-mono italic">No entries</div>
        )}
        {entries.length > 0 && (
          <pre className="overflow-auto max-h-96 rounded bg-zinc-900 p-3 text-[11px] font-mono space-y-0.5">
            {entries.map((e, i) => (
              <div key={i} className="flex gap-2 min-w-0">
                <span className="text-zinc-600 shrink-0">{e.time.slice(11, 19)}</span>
                <span className={`uppercase w-[38px] shrink-0 ${LOG_LEVEL_COLORS[e.level] ?? "text-zinc-400"}`}>{e.level}</span>
                {e.module && <span className="text-zinc-500 shrink-0">[{String(e.module)}]</span>}
                <span className="text-zinc-300 break-all">{e.msg}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </SCard>
  );
}

function MaintenanceSection() {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setMsg("");
    setErr("");
    setBusy(action);
    try {
      await fn();
      setMsg(`${action} completed`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SCard title="Maintenance" subtitle="One-click server operations. Each action will ask for confirmation.">
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}
        <div className="flex flex-wrap gap-2">
          <SButton
            variant="ghost"
            onClick={() => {
              if (confirm("Flush all cache entries? Active requests may slow down briefly.")) {
                run("Cache flushed", api.flushCache);
              }
            }}
            disabled={busy !== null}
          >
            {busy === "Cache flushed" ? "Flushing..." : "Flush cache"}
          </SButton>
          <SButton
            variant="ghost"
            onClick={() => {
              if (confirm("Queue all cron jobs to run immediately?")) {
                run("Jobs queued", api.runAllJobs);
              }
            }}
            disabled={busy !== null}
          >
            {busy === "Jobs queued" ? "Queuing..." : "Run all jobs"}
          </SButton>
          <SButton
            variant="ghost"
            onClick={() => {
              if (confirm("Trigger a database backup now?")) {
                run("Backup queued", api.triggerBackup);
              }
            }}
            disabled={busy !== null}
          >
            {busy === "Backup queued" ? "Queuing..." : "Backup now"}
          </SButton>
        </div>
      </div>
    </SCard>
  );
}

export default function AdminTab() {
  return (
    <>
      <BackgroundJobsSection />
      <AdminSection />
      <RuntimeConfigSection />
      <LogTailSection />
      <MaintenanceSection />
    </>
  );
}
