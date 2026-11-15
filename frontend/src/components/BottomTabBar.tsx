import { NavLink, useLocation } from "react-router";
import {
  Home,
  Search,
  CalendarDays,
  Bookmark,
  MoreHorizontal,
  LogIn,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useUnreadRecommendationCount } from "../hooks/useUnreadRecommendationCount";
import UnreadBadge from "./UnreadBadge";

const UNAUTHENTICATED_ROUTES = ["/login", "/signup"];

const ICON_SIZE = 22;

export default function BottomTabBar() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const unreadCount = useUnreadRecommendationCount();
  // The aria-label replaces the link's content, so the count goes in it too.
  const moreLabel =
    unreadCount > 0
      ? `${t("bottomNav.moreOptions")}, ${t("bottomNav.unreadRecommendations", { count: unreadCount })}`
      : t("bottomNav.moreOptions");

  if (loading) return null;
  if (UNAUTHENTICATED_ROUTES.includes(location.pathname)) return null;

  const tabClass = (isActive: boolean) =>
    `flex min-w-0 flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
      isActive ? "text-primary-text" : "text-muted-foreground"
    }`;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed left-3 right-3 bottom-[calc(18px+env(safe-area-inset-bottom,0px))] z-50 md:hidden"
    >
      <div className="flex items-center bg-card backdrop-blur-xl backdrop-saturate-150 border border-border rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] px-1.5">
        {user ? (
          <>
            {/* "/" opens Reels on phones (HomeRoute), so Home covers both. */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                tabClass(isActive || location.pathname === "/reels")
              }
            >
              <Home size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.home")}
              </span>
            </NavLink>

            <NavLink
              to="/browse"
              className={({ isActive }) => tabClass(isActive)}
            >
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.browse")}
              </span>
            </NavLink>

            <NavLink
              to="/calendar"
              className={({ isActive }) => tabClass(isActive)}
            >
              <CalendarDays size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.calendar")}
              </span>
            </NavLink>

            <NavLink
              to="/tracked"
              className={({ isActive }) => tabClass(isActive)}
            >
              <Bookmark size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.tracked")}
              </span>
            </NavLink>

            <NavLink
              to="/more"
              aria-label={moreLabel}
              className={({ isActive }) => tabClass(isActive)}
            >
              <div className="relative">
                <MoreHorizontal size={ICON_SIZE} aria-hidden="true" />
                <UnreadBadge
                  count={unreadCount}
                  className="absolute -top-1 -right-2"
                />
              </div>
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.more")}
              </span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink
              to="/browse"
              className={({ isActive }) => tabClass(isActive)}
            >
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.browse")}
              </span>
            </NavLink>

            <NavLink
              to="/login"
              className={({ isActive }) => tabClass(isActive)}
            >
              <LogIn size={ICON_SIZE} aria-hidden="true" />
              <span className="max-w-full truncate text-xs font-semibold tracking-[0.02em]">
                {t("bottomNav.signIn")}
              </span>
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
