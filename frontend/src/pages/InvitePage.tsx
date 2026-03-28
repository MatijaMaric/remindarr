import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Clock, CheckCircle2, XCircle, UserPlus } from "lucide-react";
import * as api from "../api";
import type { InvitationItem } from "../types";
import ShareButton from "../components/ShareButton";

type RedeemResult =
  | { status: "success"; inviterName: string }
  | { status: "error"; message: string }
  | null;

function getInviteUrl(code: string): string {
  return `${window.location.origin}/invite?code=${code}`;
}

function getStatus(inv: InvitationItem): "pending" | "used" | "expired" {
  if (inv.used_at) return "used";
  if (new Date(inv.expires_at) < new Date()) return "expired";
  return "pending";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvitePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult>(null);
  const [redeeming, setRedeeming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getInvitations();
      setInvitations(data.invitations.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-redeem from URL query parameter
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || redeeming) return;

    setRedeeming(true);
    api.redeemInvitation(code)
      .then((result) => {
        const inviterName = result.inviter.display_name || result.inviter.username;
        setRedeemResult({ status: "success", inviterName });
        toast.success(t("invite.redeemSuccess", { name: inviterName }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setRedeemResult({ status: "error", message });
        toast.error(message);
      })
      .finally(() => {
        setRedeeming(false);
        // Remove code from URL
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, setSearchParams, redeeming, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    setCreating(true);
    try {
      await api.createInvitation();
      await refresh();
      toast.success(t("invite.created"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await api.revokeInvitation(id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success(t("invite.revoked"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserPlus className="size-6 text-amber-500" />
        <h1 className="text-2xl font-bold text-white">{t("invite.title")}</h1>
      </div>

      {/* Redeem result banner */}
      {redeemResult && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            redeemResult.status === "success"
              ? "bg-green-900/20 border-green-700 text-green-200"
              : "bg-red-900/20 border-red-700 text-red-200"
          }`}
        >
          {redeemResult.status === "success"
            ? t("invite.redeemSuccess", { name: redeemResult.inviterName })
            : redeemResult.message}
        </div>
      )}

      {redeeming && (
        <div className="text-center py-8 text-zinc-400">{t("invite.redeeming")}</div>
      )}

      {/* Generate button */}
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
      >
        <Plus className="size-4" />
        {creating ? t("invite.creating") : t("invite.createLink")}
      </button>

      {/* Invitations list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-900 rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : invitations.length === 0 ? (
        <p className="text-center py-8 text-zinc-500">{t("invite.empty")}</p>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <InvitationCard
              key={inv.id}
              invitation={inv}
              revoking={revoking === inv.id}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InvitationCard({
  invitation,
  revoking,
  onRevoke,
}: {
  invitation: InvitationItem;
  revoking: boolean;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation();
  const status = getStatus(invitation);
  const inviteUrl = getInviteUrl(invitation.code);

  return (
    <div
      className={`rounded-lg p-4 border transition-colors ${
        status === "used"
          ? "bg-green-900/20 border-green-900/40"
          : status === "expired"
            ? "bg-zinc-900 border-white/[0.06] opacity-50"
            : "bg-zinc-900 border-white/[0.06]"
      }`}
    >
      {/* Status badge and code */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <StatusBadge status={status} usedBy={invitation.used_by} />
        <code
          className={`text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-300 ${
            status === "expired" ? "line-through" : ""
          }`}
        >
          {invitation.code}
        </code>
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 mb-3">
        <span>{t("invite.created_at")}: {formatDate(invitation.created_at)}</span>
        <span>{t("invite.expires_at")}: {formatDate(invitation.expires_at)}</span>
      </div>

      {/* Used by info */}
      {status === "used" && invitation.used_by && (
        <div className="text-sm text-green-300 mb-3">
          {t("invite.usedBy", {
            username: invitation.used_by.display_name || invitation.used_by.username,
          })}
          {" "}
          <Link
            to={`/user/${invitation.used_by.username}`}
            className="text-amber-500 hover:text-amber-400 transition-colors"
          >
            @{invitation.used_by.username}
          </Link>
        </div>
      )}

      {/* Actions */}
      {status === "pending" && (
        <div className="flex items-center gap-2">
          <ShareButton
            title={t("invite.shareTitle")}
            text={t("invite.shareText")}
            url={inviteUrl}
          />
          <button
            onClick={() => onRevoke(invitation.id)}
            disabled={revoking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            {revoking ? t("invite.revoking") : t("invite.revoke")}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  usedBy,
}: {
  status: "pending" | "used" | "expired";
  usedBy: InvitationItem["used_by"];
}) {
  const { t } = useTranslation();

  if (status === "used") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
        <CheckCircle2 className="size-3.5" />
        {t("invite.statusUsed", {
          username: usedBy?.display_name || usedBy?.username || "",
        })}
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
        <XCircle className="size-3.5" />
        {t("invite.statusExpired")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
      <Clock className="size-3.5" />
      {t("invite.statusPending")}
    </span>
  );
}
