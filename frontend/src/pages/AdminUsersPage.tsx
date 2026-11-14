import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Search,
  Shield,
  ShieldOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as api from "../api";
import type { AdminUser } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "../components/ui/alert-dialog";

import { formatDate } from "../components/title-detail/utils";

type Filter = "all" | "active" | "banned";

function RoleBadge({ user }: { user: AdminUser }) {
  const isAdmin = user.role === "admin" || user.is_admin === 1;
  return (
    <span
      className={`text-[11px] font-bold px-1.5 py-0.5 rounded-sm ${isAdmin ? "bg-primary-soft text-primary-text" : "bg-muted-hover text-muted-foreground"}`}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function BannedBadge() {
  return (
    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-sm bg-destructive-soft text-destructive">
      Banned
    </span>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setPage(1); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: filter/search changes should reset pagination
  }, [search, filter]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-users", search, filter, page],
    queryFn: ({ signal }) =>
      api.getAdminUsers({ search, filter, page }, signal),
  });

  const roleToggleMutation = useMutation({
    mutationFn: ({
      userId,
      newRole,
    }: {
      userId: string;
      newRole: "admin" | "user";
    }) => api.setAdminUserRole(userId, newRole),
    onError: () => toast.error("Failed to update role"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api.banAdminUser(userId, reason),
    onSuccess: () => {
      setBanTarget(null);
      setBanReason("");
    },
    onError: () => toast.error("Failed to ban user"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => api.unbanAdminUser(userId),
    onError: () => toast.error("Failed to unban user"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.deleteAdminUser(userId),
    onSuccess: () => setConfirmDelete(null),
    onError: () => toast.error("Failed to delete user"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      api.resetAdminUserPassword(userId, password),
    onSuccess: () => {
      toast.success(t("admin.users.resetPasswordDone"));
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (err: unknown) =>
      toast.error(
        err instanceof Error
          ? err.message
          : t("admin.users.resetPasswordFailed"),
      ),
  });

  function handleRoleToggle(user: AdminUser) {
    const newRole =
      user.role === "admin" || user.is_admin === 1 ? "user" : "admin";
    roleToggleMutation.mutate({ userId: user.id, newRole });
  }

  function handleBan(userId: string) {
    banMutation.mutate({ userId, reason: banReason || undefined });
  }

  function handleUnban(userId: string) {
    unbanMutation.mutate(userId);
  }

  function handleDelete(userId: string) {
    deleteMutation.mutate(userId);
  }

  if (!me?.is_admin) {
    return (
      <div className="text-muted-foreground">{t("admin.accessDenied")}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/settings"
          className="text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          ← {t("admin.backToSettings")}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {t("admin.users.title")}
        </h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {t("admin.users.total", { count: data.total })}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
            aria-label={t("admin.users.searchPlaceholder")}
            className="w-full bg-card border border-border rounded-md pl-8 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "banned"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm rounded-md transition-colors cursor-pointer ${filter === f ? "bg-primary text-primary-foreground font-medium" : "bg-card text-muted-foreground hover:text-foreground border border-border"}`}
            >
              {t(`admin.users.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Ban reason modal */}
      <AlertDialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
            setBanReason("");
          }
        }}
      >
        <AlertDialogPopup className="max-w-sm space-y-4 bg-card border-border">
          <AlertDialogTitle className="text-base font-semibold text-foreground">
            {t("admin.users.banTitle")}
          </AlertDialogTitle>
          <input
            type="text"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder={t("admin.users.banReasonPlaceholder")}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border"
          />
          <div className="flex gap-2">
            <AlertDialogClose
              onClick={() => {
                if (banTarget) void handleBan(banTarget);
              }}
              className="flex-1 py-2 bg-destructive-soft hover:bg-destructive/20 text-destructive text-sm font-medium rounded-md transition-colors cursor-pointer"
            >
              {t("admin.users.banConfirm")}
            </AlertDialogClose>
            <AlertDialogClose className="px-4 py-2 bg-muted hover:bg-muted-hover text-foreground-secondary text-sm rounded-md transition-colors cursor-pointer">
              {t("admin.cancel")}
            </AlertDialogClose>
          </div>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Reset password modal */}
      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <AlertDialogPopup className="max-w-sm space-y-4 bg-card border-border">
          <AlertDialogTitle className="text-base font-semibold text-foreground">
            {t("admin.users.resetPasswordTitle", {
              username: resetTarget?.username ?? "",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.users.resetPasswordHelp")}
          </AlertDialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetTarget)
                resetPasswordMutation.mutate({
                  userId: resetTarget.id,
                  password: newPassword,
                });
            }}
          >
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-label={t("admin.users.newPassword")}
              placeholder={t("admin.users.newPassword")}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={resetPasswordMutation.isPending}
                className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {t("admin.users.resetPasswordConfirm")}
              </button>
              <AlertDialogClose className="px-4 py-2 bg-muted hover:bg-muted-hover text-foreground-secondary text-sm rounded-md transition-colors cursor-pointer">
                {t("admin.cancel")}
              </AlertDialogClose>
            </div>
          </form>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Delete confirmation modal */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogPopup className="max-w-sm space-y-4 bg-card border-border">
          <AlertDialogTitle className="text-base font-semibold text-destructive">
            {t("admin.users.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.users.deleteConfirm")}
          </AlertDialogDescription>
          <div className="flex gap-2">
            <AlertDialogClose
              onClick={() => {
                if (confirmDelete) void handleDelete(confirmDelete);
              }}
              className="flex-1 py-2 bg-destructive-soft hover:bg-destructive/20 text-destructive text-sm font-medium rounded-md transition-colors cursor-pointer"
            >
              {t("admin.users.deleteConfirmButton")}
            </AlertDialogClose>
            <AlertDialogClose className="px-4 py-2 bg-muted hover:bg-muted-hover text-foreground-secondary text-sm rounded-md transition-colors cursor-pointer">
              {t("admin.cancel")}
            </AlertDialogClose>
          </div>
        </AlertDialogPopup>
      </AlertDialog>

      {/* User table */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          {t("admin.users.loading")}
        </div>
      ) : isError ? (
        <div className="text-destructive text-sm">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : !data || data.users.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          {t("admin.users.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">
                  {t("admin.users.col.user")}
                </th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">
                  {t("admin.users.col.role")}
                </th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                  {t("admin.users.col.provider")}
                </th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
                  {t("admin.users.col.joined")}
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  {t("admin.users.col.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-fill-subtle transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {user.username}
                          </span>
                          {user.banned && <BannedBadge />}
                          <span className="sm:hidden">
                            <RoleBadge user={user} />
                          </span>
                        </div>
                        {user.name && (
                          <div className="text-xs text-muted-foreground">
                            {user.name}
                          </div>
                        )}
                        {user.email && (
                          <div className="text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <RoleBadge user={user} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground capitalize">
                    {user.auth_provider}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {user.id !== me.id && (
                        <>
                          {/* Role toggle */}
                          <button
                            onClick={() => handleRoleToggle(user)}
                            title={
                              user.role === "admin"
                                ? t("admin.users.demote")
                                : t("admin.users.promote")
                            }
                            aria-label={
                              user.role === "admin"
                                ? t("admin.users.demote")
                                : t("admin.users.promote")
                            }
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary-text hover:bg-primary-soft transition-colors cursor-pointer"
                          >
                            <Shield size={14} />
                          </button>
                          {/* Ban/unban */}
                          {user.banned ? (
                            <button
                              onClick={() => handleUnban(user.id)}
                              title={t("admin.users.unban")}
                              aria-label={t("admin.users.unban")}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-success hover:bg-success/10 transition-colors cursor-pointer"
                            >
                              <ShieldOff size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setBanTarget(user.id);
                                setBanReason("");
                              }}
                              title={t("admin.users.ban")}
                              aria-label={t("admin.users.ban")}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-soft transition-colors cursor-pointer"
                            >
                              <ShieldOff size={14} />
                            </button>
                          )}
                          {/* Reset password (local accounts only) */}
                          {user.auth_provider === "local" && (
                            <button
                              onClick={() => {
                                setResetTarget(user);
                                setNewPassword("");
                              }}
                              title={t("admin.users.resetPassword")}
                              aria-label={t("admin.users.resetPassword")}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary-text hover:bg-primary-soft transition-colors cursor-pointer"
                            >
                              <KeyRound size={14} />
                            </button>
                          )}
                          {/* Delete */}
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            title={t("admin.users.delete")}
                            aria-label={t("admin.users.delete")}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-soft transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {user.id === me.id && (
                        <span className="text-xs text-muted-foreground px-2">
                          {t("admin.users.you")}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label={t("admin.users.prevPage")}
            className="p-2 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-muted-foreground">
            {t("admin.users.page", { page, total: data.total_pages })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
            disabled={page >= data.total_pages}
            aria-label={t("admin.users.nextPage")}
            className="p-2 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
