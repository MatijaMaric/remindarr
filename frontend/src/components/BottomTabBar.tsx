import { NavLink } from "react-router";
import { Clapperboard, Clock, Search, Sparkles, User, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { bottomTabClass } from "../nav-utils";
import { useApiCall } from "../hooks/useApiCall";
import * as api from "../api";

const ICON_SIZE = 20;

export default function BottomTabBar() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const { data: countData } = useApiCall(
    () => (user ? api.getUnreadRecommendationCount() : Promise.resolve({ count: 0 })),
    [user?.id],
  );

  const unreadCount = countData?.count ?? 0;

  if (loading) return null;

  return (
    <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-t border-white/[0.06] sm:hidden safe-bottom">
      <div className="flex justify-around">
        {user ? (
          <>
            <NavLink to="/reels" className={({ isActive }) => bottomTabClass(isActive)}>
              <Clapperboard size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.watch")}</span>
            </NavLink>

            <NavLink to="/upcoming" className={({ isActive }) => bottomTabClass(isActive)}>
              <Clock size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.upcoming")}</span>
            </NavLink>

            <NavLink to="/discovery" className={({ isActive }) => bottomTabClass(isActive)}>
              <div className="relative">
                <Sparkles size={ICON_SIZE} aria-hidden="true" />
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
              <span className="text-[10px] mt-0.5">{t("bottomNav.discovery")}</span>
            </NavLink>

            <NavLink to="/browse" className={({ isActive }) => bottomTabClass(isActive)}>
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.browse")}</span>
            </NavLink>

            <NavLink to={`/user/${user.username}`} className={({ isActive }) => bottomTabClass(isActive)}>
              <User size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.profile")}</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/browse" className={({ isActive }) => bottomTabClass(isActive)}>
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.browse")}</span>
            </NavLink>

            <NavLink to="/login" className={({ isActive }) => bottomTabClass(isActive)}>
              <LogIn size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.signIn")}</span>
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
