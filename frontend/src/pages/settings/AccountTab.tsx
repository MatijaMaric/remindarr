import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SUPPORTED_LANGUAGES, setLanguage, currentLanguage } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";
import type {
  ActivitySettings,
  ActivityType,
  ActivityKindVisibility,
} from "../../types";
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

function countryName(code: string, fallback: string, lang: string): string {
  if (lang === "en") return fallback;
  try {
    return (
      new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? fallback
    );
  } catch {
    return fallback;
  }
}

function ProfileEditForm({ profile }: { profile: api.MyProfile }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [countryCode, setCountryCode] = useState(profile.country_code ?? "");
  const [msg, setMsg] = useState("");
  const { run, error: saveErr, pending: saving } = useAsyncError();

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

  return (
    <SCard
      title={t("profile.editProfile")}
      subtitle={t("settings.account.editProfileSubtitle")}
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
                <option key={c.code} value={c.code}>
                  {countryName(c.code, c.name, i18n.language)}
                </option>
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

function ProfileEditSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: ({ signal }) => api.getMyProfile(signal),
  });

  if (isLoading) return null;
  if (!data) return null;

  return <ProfileEditForm profile={data} />;
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
        throw new Error(
          result.error.message || t("settings.account.passwordChangeFailed"),
        );
      }
      setPasswordMsg(t("profile.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
    });
  }

  const strength = passwordStrength(newPassword);
  const strengthLabel =
    strength >= 4
      ? t("settings.account.strength.strong")
      : strength >= 3
        ? t("settings.account.strength.good")
        : strength > 0
          ? t("settings.account.strength.weak")
          : "";

  const initials = (user?.username ?? "??").slice(0, 2).toUpperCase();

  return (
    <>
      <SCard
        title={t("profile.title")}
        subtitle={t("settings.account.profileSubtitle")}
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
            <SFormRow label={t("settings.account.authProvider")}>
              <SInput value={user?.auth_provider ?? "local"} mono readOnly />
            </SFormRow>
            <SFormRow label={t("profile.displayName")}>
              <SInput
                value={user?.display_name ?? user?.username ?? ""}
                readOnly
              />
            </SFormRow>
            <SFormRow label={t("profile.role")}>
              <SInput
                value={user?.is_admin ? t("profile.admin") : t("profile.user")}
                mono
                readOnly
              />
            </SFormRow>
          </div>
        </div>
      </SCard>

      {user && user.auth_provider === "local" && (
        <SCard
          title={t("profile.changePassword")}
          subtitle={t("settings.account.passwordSubtitle")}
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
                hint={
                  strengthLabel ? (
                    <span>
                      {t("settings.account.strengthLabel", {
                        strength: strengthLabel,
                      })}
                    </span>
                  ) : undefined
                }
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

      <LanguageSection />
    </>
  );
}

function LanguageSection() {
  const { t } = useTranslation();
  const active = currentLanguage();

  async function handleSelect(code: string) {
    if (code === active) return;
    await setLanguage(code);
    // Remember the choice on the account too, so server-generated content
    // can follow it. Best-effort: the UI switch already happened locally.
    api.updateMyProfile({ locale: code }).catch(() => undefined);
  }

  return (
    <SCard
      title={t("profile.language")}
      subtitle={t("settings.account.languageSubtitle")}
    >
      <div
        role="group"
        aria-label={t("profile.language")}
        className="flex gap-1.5 flex-wrap"
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
          const selected = lang.code === active;
          return (
            <button
              key={lang.code}
              type="button"
              lang={lang.code}
              aria-pressed={selected}
              onClick={() => void handleSelect(lang.code)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border flex items-center gap-1.5",
                selected
                  ? "bg-amber-400 text-black border-transparent"
                  : "bg-zinc-800 text-zinc-200 border-white/[0.08] hover:bg-zinc-700",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px]",
                  selected ? "text-black/60" : "text-zinc-500",
                )}
              >
                {lang.code}
              </span>
              {lang.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500 mt-3">
        {t("settings.account.languageHint")}
      </p>
    </SCard>
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
  const [status, setStatus] = useState<
    "loading" | "idle" | "adding" | "deleting"
  >("loading");
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [passkeyName, setPasskeyName] = useState("");

  const loading = status === "loading";
  const adding = status === "adding";

  // Mirror the prior reducer's OP_DONE / OP_ERROR transitions so multi-field
  // updates stay atomic (React batches these setState calls into one render).
  function opDone(nextPasskeys: PasskeyItem[], message: string) {
    setStatus("idle");
    setPasskeys(nextPasskeys);
    setMsg(message);
    setErr("");
    setPendingId(null);
  }

  function opError(error: string) {
    setStatus("idle");
    setErr(error);
    setPendingId(null);
  }

  const webauthnSupported =
    typeof window !== "undefined" && !!window.PublicKeyCredential;

  useEffect(() => {
    if (!webauthnSupported) {
      setStatus("idle");
      return;
    }
    authClient.passkey
      .listUserPasskeys()
      .then((result) => {
        if (result.data) {
          setStatus("idle");
          setPasskeys(result.data as PasskeyItem[]);
        } else setStatus("idle");
      })
      .catch(() => setStatus("idle"));
  }, [webauthnSupported]);

  async function handleAddPasskey() {
    setStatus("adding");
    setMsg("");
    setErr("");
    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName || user?.username || undefined,
      });
      if (result?.error) {
        throw new Error(
          String(result.error.message || t("profile.passkeyAddFailed")),
        );
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      opDone(
        (listResult.data as PasskeyItem[]) ?? [],
        t("profile.passkeyAdded"),
      );
      setPasskeyName("");
    } catch (e: unknown) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") {
        opError(e instanceof Error ? e.message : String(e));
      } else {
        opError("");
      }
    }
  }

  async function handleDeletePasskey(id: string) {
    setStatus("deleting");
    setMsg("");
    setErr("");
    setPendingId(id);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result?.error) {
        throw new Error(
          String(
            result.error.message || t("settings.account.passkeyDeleteFailed"),
          ),
        );
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      opDone(
        (listResult.data as PasskeyItem[]) ?? [],
        t("profile.passkeyDeleted"),
      );
    } catch (e: unknown) {
      opError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRenamePasskey(id: string) {
    if (!editName.trim()) return;
    try {
      const result = await authClient.passkey.updatePasskey({
        id,
        name: editName.trim(),
      });
      if (result?.error) {
        throw new Error(
          String(
            result.error.message || t("settings.account.passkeyRenameFailed"),
          ),
        );
      }
      const listResult = await authClient.passkey.listUserPasskeys();
      opDone(
        (listResult.data as PasskeyItem[]) ?? [],
        t("profile.passkeyRenamed"),
      );
      setEditing(null);
      setEditName("");
    } catch (e: unknown) {
      opError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!webauthnSupported) return null;

  return (
    <SCard
      title={t("profile.passkeys")}
      subtitle={t("settings.account.passkeysSubtitle")}
    >
      <div className="space-y-3">
        {msg && <SMessage kind="success">{msg}</SMessage>}
        {err && <SMessage kind="error">{err}</SMessage>}

        {loading ? (
          <p className="text-zinc-400 text-sm">{t("common.loading")}</p>
        ) : (
          <>
            {passkeys.length === 0 ? (
              <p className="text-zinc-400 text-sm py-1">
                {t("profile.noPasskeys")}
              </p>
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
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRenamePasskey(pk.id);
                        }}
                      >
                        <SInput
                          value={editName}
                          onChange={setEditName}
                          autoFocus
                          aria-label={t("settings.account.passkeyNameLabel")}
                        />
                        <SButton type="submit" small>
                          {t("common.save")}
                        </SButton>
                        <SButton
                          type="button"
                          variant="ghost"
                          small
                          onClick={() => {
                            setEditing(null);
                            setEditName("");
                          }}
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
                              {t("settings.account.passkeyCreated", {
                                date: new Date(
                                  pk.createdAt,
                                ).toLocaleDateString(),
                              })}
                            </div>
                          )}
                        </div>
                        <SButton
                          variant="ghost"
                          small
                          onClick={() => {
                            setEditing(pk.id);
                            setEditName(pk.name || "");
                          }}
                        >
                          {t("profile.renamePasskey")}
                        </SButton>
                        <SButton
                          variant="outline"
                          small
                          danger
                          disabled={
                            status === "deleting" && pendingId === pk.id
                          }
                          onClick={() => handleDeletePasskey(pk.id)}
                        >
                          {status === "deleting" && pendingId === pk.id
                            ? t("profile.deletingPasskey")
                            : t("profile.deletePasskey")}
                        </SButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1 bg-zinc-800 rounded-[10px] p-3.5">
              <div className="flex-1">
                <SLabel
                  htmlFor="passkey-name-input"
                  hint={<span>{t("common.optional")}</span>}
                >
                  {t("profile.passkeyName")}
                </SLabel>
                <SInput
                  id="passkey-name-input"
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
  const qc = useQueryClient();
  const [updatingGlobal, setUpdatingGlobal] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [err, setErr] = useState("");

  const { data, isLoading: loading } = useQuery({
    queryKey: ["tracked"],
    queryFn: ({ signal }) => api.getTrackedTitles(signal),
  });

  const visibility =
    data?.profile_visibility ?? (data?.profile_public ? "public" : "private");
  const titles = data?.titles ?? [];

  const updateVisibilityMutation = useMutation({
    mutationFn: (newVisibility: string) =>
      api.updateProfileVisibility(newVisibility),
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : String(e));
      toast.error(t("settings.account.visibilityUpdateFailed"));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tracked"] }),
  });

  const bulkVisibilityMutation = useMutation({
    mutationFn: (isPublic: boolean) => api.updateAllTitleVisibility(isPublic),
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : String(e));
      toast.error(t("settings.account.visibilityUpdateFailed"));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tracked"] }),
  });

  async function handleVisibilityChange(newVisibility: string) {
    setErr("");
    setUpdatingGlobal(true);
    try {
      await updateVisibilityMutation.mutateAsync(newVisibility);
    } finally {
      setUpdatingGlobal(false);
    }
  }

  async function handleBulkVisibility(isPublic: boolean) {
    setErr("");
    setUpdatingAll(true);
    try {
      await bulkVisibilityMutation.mutateAsync(isPublic);
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
          <SDivider label={t("settings.account.perTitleOverrides")} />
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
        <p className="text-zinc-500 text-sm mt-4">
          {t("settings.noTrackedTitles")}
        </p>
      )}
    </SCard>
  );
}

const ACTIVITY_KINDS: ActivityType[] = [
  "rating_title",
  "rating_episode",
  "watched_title",
  "watched_episode",
  "tracked",
  "recommendation",
  "episode_comment",
];

const KIND_VIS_OPTIONS = ["public", "friends_only", "private"] as const;

function ActivityStreamSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [err, setErr] = useState("");

  const { data, isLoading: loading } = useQuery({
    queryKey: ["activity-settings"],
    queryFn: ({ signal }) => api.getActivitySettings(signal),
  });

  const settings: ActivitySettings = data ?? {
    enabled: false,
    kind_visibility: {},
  };

  const updateSettingsMutation = useMutation({
    mutationFn: (patch: Partial<ActivitySettings>) =>
      api.updateActivitySettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["activity-settings"] });
      const snapshot = qc.getQueryData<ActivitySettings>(["activity-settings"]);
      qc.setQueryData<ActivitySettings>(["activity-settings"], (prev) =>
        prev ? { ...prev, ...patch } : prev,
      );
      return { snapshot };
    },
    onError: (e: unknown, _vars, context) => {
      if (context?.snapshot)
        qc.setQueryData(["activity-settings"], context.snapshot);
      setErr(e instanceof Error ? e.message : String(e));
      toast.error(t("settings.activityStream.updateFailed"));
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: ["activity-settings"] }),
  });

  const saving = updateSettingsMutation.isPending;

  function handleToggle(next: boolean) {
    setErr("");
    updateSettingsMutation.mutate({ enabled: next });
  }

  function handleKindChange(
    kind: ActivityType,
    value: "public" | "friends_only" | "private",
  ) {
    const next: ActivityKindVisibility = {
      ...settings.kind_visibility,
      [kind]: value,
    };
    setErr("");
    updateSettingsMutation.mutate({ kind_visibility: next });
  }

  if (loading) {
    return (
      <SCard
        title={t("settings.activityStream.title")}
        subtitle={t("settings.activityStream.loadingSubtitle")}
      >
        <div className="text-zinc-500 text-sm">{t("common.loading")}</div>
      </SCard>
    );
  }

  return (
    <SCard
      title={t("settings.activityStream.title")}
      subtitle={t("settings.activityStream.subtitle")}
    >
      {err && (
        <div className="mb-4">
          <SMessage kind="error">{err}</SMessage>
        </div>
      )}
      <SSwitch
        label={t("settings.activityStream.showOnProfile")}
        sub={
          settings.enabled
            ? t("settings.activityStream.visibleHint")
            : t("settings.activityStream.hiddenHint")
        }
        on={settings.enabled}
        onChange={handleToggle}
        disabled={saving}
      />
      {settings.enabled && (
        <>
          <SDivider label={t("settings.activityStream.perKind")} />
          <p className="text-xs text-zinc-500 mb-3">
            {t("settings.activityStream.perKindHint")}
          </p>
          <div className="space-y-2">
            {ACTIVITY_KINDS.map((kind) => {
              const current = settings.kind_visibility[kind] ?? "public";
              return (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04] last:border-b-0"
                >
                  <span className="text-sm text-zinc-300">
                    {t(`settings.activityStream.kinds.${kind}`)}
                  </span>
                  <div className="flex items-center gap-1">
                    {KIND_VIS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={saving}
                        aria-pressed={current === opt}
                        onClick={() => handleKindChange(kind, opt)}
                        className={cn(
                          "text-[11px] font-mono px-2 py-1 rounded-md transition-colors disabled:opacity-50",
                          current === opt
                            ? "bg-amber-400/15 text-amber-400 font-semibold"
                            : "text-zinc-500 hover:text-zinc-300",
                        )}
                      >
                        {t(`settings.activityStream.visibility.${opt}`)}
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
      title={t("settings.account.socialTitle")}
      subtitle={t("settings.account.socialSubtitle")}
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
          <div className="text-[11px] text-zinc-400 font-mono">
            {t("settings.account.socialHint")}
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
