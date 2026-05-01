import { useState, useEffect, useCallback, useReducer } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import type { Title, ActivitySettings, ActivityType, ActivityKindVisibility } from "../../types";
import { authClient } from "../../lib/auth-client";
import { UserPlus } from "lucide-react";
import { useAsyncError } from "../../hooks/useAsyncError";
import {
  SCard,
  SFormRow,
  SRadioCard,
  SMessage,
  SDivider,
  SSwitch,
  SButton,
  SInput,
  SLabel,
} from "../../components/settings/kit";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "HR", name: "Croatia" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RU", name: "Russia" },
  { code: "SE", name: "Sweden" },
  { code: "TR", name: "Turkey" },
  { code: "US", name: "United States" },
  { code: "ZA", name: "South Africa" },
];

function ProfileEditSection() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const { run, error: saveErr, pending: saving } = useAsyncError();

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    api.getMyProfile(controller.signal).then((data) => {
      if (!mounted) return;
      setDisplayName(data.display_name ?? "");
      setBio(data.bio ?? "");
      setCountryCode(data.country_code ?? "");
      setLoaded(true);
    }).catch(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; controller.abort(); };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    await run(async () => {
      await api.updateMyProfile({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        country_code: countryCode || null,
      });
      setMsg(t("profile.profileSaved"));
    });
  }

  if (!loaded) return null;

  return (
    <SCard
      title={t("profile.editProfile")}
      subtitle="Your display name, bio, and country appear on your public profile."
    >
      <form onSubmit={handleSave} className="space-y-3.5 max-w-[640px]">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {saveErr && <SMessage kind="error">{saveErr}</SMessage>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <SFormRow label={t("profile.displayName")}>
            <SInput
              value={displayName}
              onChange={setDisplayName}
              placeholder={user?.username ?? ""}
            />
          </SFormRow>
          <SFormRow label={t("profile.country")}>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 focus:border-transparent"
            >
              <option value="">{t("profile.noCountry")}</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </SFormRow>
        </div>
        <SFormRow label={t("profile.bio")}>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("profile.bioPlaceholder")}
            maxLength={280}
            rows={3}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 placeholder-zinc-500 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 resize-none"
          />
        </SFormRow>
        <div>
          <SButton type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </SButton>
        </div>
      </form>
    </SCard>
  );
}

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

const VISIBILITY_OPTIONS = ["public", "friends_only", "private"] as const;

function UserSection() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const { run, error: passwordErr, pending: loading } = useAsyncError();

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    await run(async () => {
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
    });
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

type PasskeyState = {
  status: "loading" | "idle" | "adding" | "deleting";
  passkeys: PasskeyItem[];
  message: string;
  error: string;
  pendingId: string | null;
};

type PasskeyAction =
  | { type: "LOAD_SUCCESS"; passkeys: PasskeyItem[] }
  | { type: "LOAD_DONE" }
  | { type: "ADD_START" }
  | { type: "DELETE_START"; id: string }
  | { type: "OP_DONE"; passkeys: PasskeyItem[]; message: string }
  | { type: "OP_ERROR"; error: string };

function passkeyReducer(state: PasskeyState, action: PasskeyAction): PasskeyState {
  switch (action.type) {
    case "LOAD_SUCCESS":
      return { ...state, status: "idle", passkeys: action.passkeys };
    case "LOAD_DONE":
      return { ...state, status: "idle" };
    case "ADD_START":
      return { ...state, status: "adding", message: "", error: "" };
    case "DELETE_START":
      return { ...state, status: "deleting", message: "", error: "", pendingId: action.id };
    case "OP_DONE":
      return { status: "idle", passkeys: action.passkeys, message: action.message, error: "", pendingId: null };
    case "OP_ERROR":
      return { ...state, status: "idle", error: action.error, pendingId: null };
    default:
      return state;
  }
}

function PasskeySection() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [pkState, dispatch] = useReducer(passkeyReducer, {
    status: "loading",
    passkeys: [],
    message: "",
    error: "",
    pendingId: null,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [passkeyName, setPasskeyName] = useState("");

  const { status, passkeys, message: msg, error: err, pendingId } = pkState;
  const loading = status === "loading";
  const adding = status === "adding";

  const webauthnSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  useEffect(() => {
    if (!webauthnSupported) { dispatch({ type: "LOAD_DONE" }); return; }
    authClient.passkey.listUserPasskeys()
      .then((result) => {
        if (result.data) dispatch({ type: "LOAD_SUCCESS", passkeys: result.data as PasskeyItem[] });
        else dispatch({ type: "LOAD_DONE" });
      })
      .catch(() => dispatch({ type: "LOAD_DONE" }));
  }, [webauthnSupported]);

  async function handleAddPasskey() {
    dispatch({ type: "ADD_START" });
    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName || user?.username || undefined,
      });
      if (result?.error) {
        throw new Error(String(result.error.message || t("profile.passkeyAddFailed")));
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      dispatch({ type: "OP_DONE", passkeys: (listResult.data as PasskeyItem[]) ?? [], message: t("profile.passkeyAdded") });
      setPasskeyName("");
    } catch (e: unknown) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") {
        dispatch({ type: "OP_ERROR", error: e instanceof Error ? e.message : String(e) });
      } else {
        dispatch({ type: "OP_ERROR", error: "" });
      }
    }
  }

  async function handleDeletePasskey(id: string) {
    dispatch({ type: "DELETE_START", id });
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result?.error) {
        throw new Error(String(result.error.message || "Failed to delete passkey"));
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      dispatch({ type: "OP_DONE", passkeys: (listResult.data as PasskeyItem[]) ?? [], message: t("profile.passkeyDeleted") });
    } catch (e: unknown) {
      dispatch({ type: "OP_ERROR", error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleRenamePasskey(id: string) {
    if (!editName.trim()) return;
    try {
      const result = await authClient.passkey.updatePasskey({ id, name: editName.trim() });
      if (result?.error) {
        throw new Error(String(result.error.message || "Failed to rename passkey"));
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      dispatch({ type: "OP_DONE", passkeys: (listResult.data as PasskeyItem[]) ?? [], message: t("profile.passkeyRenamed") });
      setEditing(null);
      setEditName("");
    } catch (e: unknown) {
      dispatch({ type: "OP_ERROR", error: e instanceof Error ? e.message : String(e) });
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
                          disabled={status === "deleting" && pendingId === pk.id}
                          onClick={() => handleDeletePasskey(pk.id)}
                        >
                          {status === "deleting" && pendingId === pk.id ? t("profile.deletingPasskey") : t("profile.deletePasskey")}
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

function ProfileVisibilitySection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<string>("private");
  const [titles, setTitles] = useState<(Title & { public: boolean })[]>([]);
  const [updatingGlobal, setUpdatingGlobal] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api.getTrackedTitles(signal);
      if (signal?.aborted) return;
      setVisibility(data.profile_visibility || (data.profile_public ? "public" : "private"));
      setTitles(data.titles);
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

const ACTIVITY_KIND_LABELS: Record<ActivityType, string> = {
  rating_title: "Movie/show ratings",
  rating_episode: "Episode ratings",
  watched_title: "Watched movies/shows",
  watched_episode: "Watched episodes",
  tracked: "Watchlist additions",
  recommendation: "Recommendations sent",
};

const ACTIVITY_KINDS: ActivityType[] = [
  "rating_title",
  "rating_episode",
  "watched_title",
  "watched_episode",
  "tracked",
  "recommendation",
];

const KIND_VIS_OPTIONS: Array<{ value: "public" | "friends_only" | "private"; label: string }> = [
  { value: "public", label: "Everyone" },
  { value: "friends_only", label: "Friends only" },
  { value: "private", label: "Only me" },
];

function ActivityStreamSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ActivitySettings>({
    enabled: false,
    kind_visibility: {},
  });
  const [err, setErr] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api.getActivitySettings(signal);
      if (signal?.aborted) return;
      setSettings(data);
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

  async function handleToggle(next: boolean) {
    setSaving(true);
    setErr("");
    try {
      const updated = await api.updateActivitySettings({ enabled: next });
      setSettings(updated);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleKindChange(kind: ActivityType, value: "public" | "friends_only" | "private") {
    const next: ActivityKindVisibility = { ...settings.kind_visibility, [kind]: value };
    setSettings((prev) => ({ ...prev, kind_visibility: next }));
    setSaving(true);
    setErr("");
    try {
      const updated = await api.updateActivitySettings({ kind_visibility: next });
      setSettings(updated);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SCard title="Activity stream" subtitle="Share your activity on your public profile.">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </SCard>
    );
  }

  return (
    <SCard
      title="Activity stream"
      subtitle="Share your recent activity (ratings, watches, recommendations) on your profile. Off by default."
    >
      {err && (
        <div className="mb-4">
          <SMessage kind="error">{err}</SMessage>
        </div>
      )}
      <SSwitch
        label="Show activity on profile"
        sub={settings.enabled ? "Visitors who can see your profile will see your activity feed." : "Activity feed is hidden from other users."}
        on={settings.enabled}
        onChange={handleToggle}
        disabled={saving}
      />
      {settings.enabled && (
        <>
          <SDivider label="Per-kind visibility" />
          <p className="text-xs text-zinc-500 mb-3">
            Override who can see each type of activity. Falls back to your profile visibility when set to "Everyone".
          </p>
          <div className="space-y-2">
            {ACTIVITY_KINDS.map((kind) => {
              const current = settings.kind_visibility[kind] ?? "public";
              return (
                <div key={kind} className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04] last:border-b-0">
                  <span className="text-sm text-zinc-300">{ACTIVITY_KIND_LABELS[kind]}</span>
                  <div className="flex items-center gap-1">
                    {KIND_VIS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={saving}
                        onClick={() => handleKindChange(kind, opt.value)}
                        className={cn(
                          "text-[11px] font-mono px-2 py-1 rounded-md transition-colors disabled:opacity-50",
                          current === opt.value
                            ? "bg-amber-400/15 text-amber-400 font-semibold"
                            : "text-zinc-500 hover:text-zinc-300",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
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

export default function AccountTab() {
  return (
    <>
      <UserSection />
      <ProfileEditSection />
      <PasskeySection />
      <ProfileVisibilitySection />
      <ActivityStreamSection />
      <SocialSection />
    </>
  );
}
