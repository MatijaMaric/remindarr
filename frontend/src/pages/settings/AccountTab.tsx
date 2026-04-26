import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import type { Title } from "../../types";
import { authClient } from "../../lib/auth-client";
import { UserPlus } from "lucide-react";
import {
  SCard,
  SFormRow,
  SRadioCard,
  SMessage,
  SDivider,
  SButton,
  SInput,
  SLabel,
} from "../../components/settings/kit";
import { cn } from "@/lib/utils";

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

export default function AccountTab() {
  return (
    <>
      <UserSection />
      <PasskeySection />
      <ProfileVisibilitySection />
      <SocialSection />
    </>
  );
}
