import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type { Integration, PlexServer } from "../../api";
import {
  SCard,
  SStatusPill,
  SHint,
  SButton,
  SInput,
  SLabel,
  SMessage,
} from "../../components/settings/kit";
import { cn } from "@/lib/utils";

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
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
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

function KioskSection() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getKioskToken()
      .then(({ token: tok }) => { setToken(tok); setLoadingToken(false); })
      .catch(() => setLoadingToken(false));
  }, []);

  const kioskUrl = token ? `${window.location.origin}/kiosk/${token}` : null;

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const { token: newToken } = await api.regenerateKioskToken();
      setToken(newToken);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await api.revokeKioskToken();
      setToken(null);
    } finally {
      setRevoking(false);
    }
  }

  async function handleCopy() {
    if (!kioskUrl) return;
    await navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SCard title={t("kiosk.title")} subtitle={t("kiosk.description")}>
      {loadingToken ? (
        <p className="text-sm text-zinc-500">{t("common.loading")}</p>
      ) : token ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <SInput
              value={kioskUrl!}
              mono
              readOnly
              aria-label={t("kiosk.title")}
            />
            <div className="flex gap-2 shrink-0">
              <SButton variant="ghost" small onClick={handleCopy}>
                {copied ? t("kiosk.copied") : t("kiosk.copyUrl")}
              </SButton>
              <SButton
                variant="ghost"
                small
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? t("kiosk.regenerating") : t("kiosk.regenerate")}
              </SButton>
              <SButton
                variant="ghost"
                small
                onClick={handleRevoke}
                disabled={revoking}
              >
                {revoking ? t("kiosk.revoking") : t("kiosk.revoke")}
              </SButton>
            </div>
          </div>
          <SHint kind="info">{t("kiosk.warning")}</SHint>
        </div>
      ) : (
        <SButton onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? t("kiosk.generating") : t("kiosk.generate")}
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

export default function IntegrationsTab() {
  return (
    <>
      <PlexSection />
      <CalendarFeedSection />
      <KioskSection />
      <WatchlistSection />
      <CsvImportSection />
    </>
  );
}
