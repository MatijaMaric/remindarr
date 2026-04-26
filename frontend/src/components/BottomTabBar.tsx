import { NavLink } from "react-router";
import { Home, Search, CalendarDays, Bookmark, MoreHorizontal, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useApiCall } from "../hooks/useApiCall";
import * as api from "../api";

const ICON_SIZE = 22;

export default function BottomTabBar() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const { data: countData } = useApiCall(
    (signal) => (user ? api.getUnreadRecommendationCount(signal) : Promise.resolve({ count: 0 })),
    [user?.id],
  );

  const unreadCount = countData?.count ?? 0;

  if (loading) return null;

  const tabClass = (isActive: boolean) =>
    `flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
      isActive ? "text-amber-400" : "text-zinc-500"
    }`;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed left-3 right-3 bottom-[18px] z-50 sm:hidden"
    >
      <div
        className="flex items-center bg-zinc-900/[0.72] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.08] rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] px-1.5"
      >
        {user ? (
          <>
            <NavLink to="/reels" className={({ isActive }) => tabClass(isActive)}>
              <Home size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.home")}</span>
            </NavLink>

            <NavLink to="/browse" className={({ isActive }) => tabClass(isActive)}>
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.browse")}</span>
            </NavLink>

            <NavLink to="/calendar" className={({ isActive }) => tabClass(isActive)}>
              <CalendarDays size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.calendar")}</span>
            </NavLink>

            <NavLink to="/tracked" className={({ isActive }) => tabClass(isActive)}>
              <Bookmark size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.tracked")}</span>
            </NavLink>

            <NavLink to="/more" className={({ isActive }) => tabClass(isActive)}>
              <div className="relative">
                <MoreHorizontal size={ICON_SIZE} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span
                    data-testid="unread-badge"
                    aria-label={t("bottomNav.unreadRecommendations", { count: unreadCount })}
                    className="absolute -top-1 -right-2 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold leading-none"
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.more")}</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/browse" className={({ isActive }) => tabClass(isActive)}>
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.browse")}</span>
            </NavLink>

            <NavLink to="/login" className={({ isActive }) => tabClass(isActive)}>
              <LogIn size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-[0.02em]">{t("bottomNav.signIn")}</span>
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
