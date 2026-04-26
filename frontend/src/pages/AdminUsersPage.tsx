import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Search, Shield, ShieldOff, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import * as api from "../api";
import type { AdminUser, AdminUsersResponse } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "../components/ui/alert-dialog";

type Filter = "all" | "active" | "banned";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function RoleBadge({ user }: { user: AdminUser }) {
  const isAdmin = user.role === "admin" || user.is_admin === 1;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isAdmin ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400"}`}>
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function BannedBadge() {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">
      Banned
    </span>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { t } = useTranslation();

  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banTarget, setBanTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAdminUsers({ search, filter, page });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  async function handleRoleToggle(user: AdminUser) {
    setActionError("");
    const newRole = user.role === "admin" || user.is_admin === 1 ? "user" : "admin";
    try {
      await api.setAdminUserRole(user.id, newRole);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBan(userId: string) {
    setActionError("");
    try {
      await api.banAdminUser(userId, banReason || undefined);
      setBanTarget(null);
      setBanReason("");
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUnban(userId: string) {
    setActionError("");
    try {
      await api.unbanAdminUser(userId);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(userId: string) {
    setActionError("");
    try {
      await api.deleteAdminUser(userId);
      setConfirmDelete(null);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!me?.is_admin) {
    return <div className="text-zinc-500">{t("admin.accessDenied")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/settings" className="text-zinc-400 hover:text-white transition-colors text-sm">
          ← {t("admin.backToSettings")}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t("admin.users.title")}</h1>
        {data && (
          <span className="text-sm text-zinc-400">{t("admin.users.total", { count: data.total })}</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users.searchPlaceholder")}
            aria-label={t("admin.users.searchPlaceholder")}
            className="w-full bg-zinc-900 border border-white/[0.06] rounded-lg pl-8 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "banned"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${filter === f ? "bg-amber-500 text-black font-medium" : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/[0.06]"}`}
            >
              {t(`admin.users.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded-lg text-sm">
          {actionError}
        </div>
      )}

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
        <AlertDialogPopup className="max-w-sm space-y-4 bg-zinc-900 border-white/[0.08]">
          <AlertDialogTitle className="text-base font-semibold text-white">
            {t("admin.users.banTitle")}
          </AlertDialogTitle>
          <input
            type="text"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder={t("admin.users.banReasonPlaceholder")}
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <div className="flex gap-2">
            <AlertDialogClose
              onClick={() => { if (banTarget) void handleBan(banTarget); }}
              className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {t("admin.users.banConfirm")}
            </AlertDialogClose>
            <AlertDialogClose
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer"
            >
              {t("admin.cancel")}
            </AlertDialogClose>
          </div>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Delete confirmation modal */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogPopup className="max-w-sm space-y-4 bg-zinc-900 border-white/[0.08]">
          <AlertDialogTitle className="text-base font-semibold text-red-400">
            {t("admin.users.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.users.deleteConfirm")}
          </AlertDialogDescription>
          <div className="flex gap-2">
            <AlertDialogClose
              onClick={() => { if (confirmDelete) void handleDelete(confirmDelete); }}
              className="flex-1 py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {t("admin.users.deleteConfirmButton")}
            </AlertDialogClose>
            <AlertDialogClose
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer"
            >
              {t("admin.cancel")}
            </AlertDialogClose>
          </div>
        </AlertDialogPopup>
      </AlertDialog>

      {/* User table */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">{t("admin.users.loading")}</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : !data || data.users.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">{t("admin.users.empty")}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">{t("admin.users.col.user")}</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("admin.users.col.role")}</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("admin.users.col.provider")}</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("admin.users.col.joined")}</th>
                <th className="text-right px-4 py-3 font-medium">{t("admin.users.col.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-white">{user.username}</span>
                          {user.banned && <BannedBadge />}
                          <span className="sm:hidden"><RoleBadge user={user} /></span>
                        </div>
                        {user.name && <div className="text-xs text-zinc-500">{user.name}</div>}
                        {user.email && <div className="text-xs text-zinc-600">{user.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <RoleBadge user={user} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-zinc-400 capitalize">
                    {user.auth_provider}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-zinc-500">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {user.id !== me.id && (
                        <>
                          {/* Role toggle */}
                          <button
                            onClick={() => handleRoleToggle(user)}
                            title={user.role === "admin" ? t("admin.users.demote") : t("admin.users.promote")}
                            aria-label={user.role === "admin" ? t("admin.users.demote") : t("admin.users.promote")}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                          >
                            <Shield size={14} />
                          </button>
                          {/* Ban/unban */}
                          {user.banned ? (
                            <button
                              onClick={() => handleUnban(user.id)}
                              title={t("admin.users.unban")}
                              aria-label={t("admin.users.unban")}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                            >
                              <ShieldOff size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => { setBanTarget(user.id); setBanReason(""); }}
                              title={t("admin.users.ban")}
                              aria-label={t("admin.users.ban")}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              <ShieldOff size={14} />
                            </button>
                          )}
                          {/* Delete */}
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            title={t("admin.users.delete")}
                            aria-label={t("admin.users.delete")}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {user.id === me.id && (
                        <span className="text-xs text-zinc-600 px-2">{t("admin.users.you")}</span>
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
            className="p-2 rounded-lg bg-zinc-900 border border-white/[0.06] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-zinc-400">
            {t("admin.users.page", { page, total: data.total_pages })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
            disabled={page >= data.total_pages}
            aria-label={t("admin.users.nextPage")}
            className="p-2 rounded-lg bg-zinc-900 border border-white/[0.06] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
