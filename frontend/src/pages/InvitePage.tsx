import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as api from "../api";
import type { InvitationItem } from "../types";
import ShareButton from "../components/ShareButton";
import { formatDate } from "../components/title-detail/utils";

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

export default function InvitePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [redeemResult, setRedeemResult] = useState<RedeemResult>(null);
  const [redeeming, setRedeeming] = useState(false);

  const { data: invitationsData, isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: ({ signal }) => api.getInvitations(signal),
  });

  const invitations = (invitationsData?.invitations ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const createMutation = useMutation({
    mutationFn: () => api.createInvitation(),
    onSuccess: () => toast.success(t("invite.created")),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeInvitation(id),
    onSuccess: () => toast.success(t("invite.revoked")),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["invitations"] }),
  });

  // Auto-redeem from URL query parameter
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || redeeming) return;

    setRedeeming(true); // eslint-disable-line react-hooks/set-state-in-effect -- guards against running the effect twice
    api
      .redeemInvitation(code)
      .then((result) => {
        const inviterName =
          result.inviter.display_name || result.inviter.username;
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

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserPlus className="size-6 text-primary-text" />
        <h1 className="text-2xl font-bold text-foreground">
          {t("invite.title")}
        </h1>
      </div>

      {/* Redeem result banner */}
      {redeemResult && (
        <div
          className={`p-4 rounded-md border text-sm ${
            redeemResult.status === "success"
              ? "bg-success/20 border-success text-success"
              : "bg-destructive-soft border-destructive/40 text-destructive"
          }`}
        >
          {redeemResult.status === "success"
            ? t("invite.redeemSuccess", { name: redeemResult.inviterName })
            : redeemResult.message}
        </div>
      )}

      {redeeming && (
        <div className="text-center py-8 text-muted-foreground">
          {t("invite.redeeming")}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md transition-colors disabled:opacity-50 cursor-pointer"
      >
        <Plus className="size-4" />
        {createMutation.isPending
          ? t("invite.creating")
          : t("invite.createLink")}
      </button>

      {/* Invitations list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card rounded-md p-4 animate-pulse h-24"
            />
          ))}
        </div>
      ) : invitations.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">
          {t("invite.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <InvitationCard
              key={inv.id}
              invitation={inv}
              revoking={
                revokeMutation.isPending && revokeMutation.variables === inv.id
              }
              onRevoke={(id) => revokeMutation.mutate(id)}
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
      className={`rounded-md p-4 border transition-colors ${
        status === "used"
          ? "bg-success/20 border-success/40"
          : status === "expired"
            ? "bg-card border-border opacity-50"
            : "bg-card border-border"
      }`}
    >
      {/* Status badge and code */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <StatusBadge status={status} usedBy={invitation.used_by} />
        <code
          className={`text-xs font-mono px-2 py-1 rounded-sm bg-muted text-foreground-secondary ${
            status === "expired" ? "line-through" : ""
          }`}
        >
          {invitation.code}
        </code>
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
        <span>
          {t("invite.created_at")}:{" "}
          {formatDate(invitation.created_at, { withTime: true })}
        </span>
        <span>
          {t("invite.expires_at")}:{" "}
          {formatDate(invitation.expires_at, { withTime: true })}
        </span>
      </div>

      {/* Used by info */}
      {status === "used" && invitation.used_by && (
        <div className="text-sm text-success mb-3">
          {t("invite.usedBy", {
            username:
              invitation.used_by.display_name || invitation.used_by.username,
          })}{" "}
          <Link
            to={`/user/${invitation.used_by.username}`}
            className="text-primary-text hover:text-primary-text transition-colors"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer bg-destructive-soft text-destructive hover:bg-destructive-soft/80 hover:text-destructive disabled:opacity-50"
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
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5" />
        {t("invite.statusUsed", {
          username: usedBy?.display_name || usedBy?.username || "",
        })}
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <XCircle className="size-3.5" />
        {t("invite.statusExpired")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-text">
      <Clock className="size-3.5" />
      {t("invite.statusPending")}
    </span>
  );
}
