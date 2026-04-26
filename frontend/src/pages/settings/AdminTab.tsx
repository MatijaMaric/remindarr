import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import * as api from "../../api";
import type { JobsResponse } from "../../api";
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

export default function AdminTab() {
  return (
    <>
      <BackgroundJobsSection />
      <AdminSection />
    </>
  );
}
