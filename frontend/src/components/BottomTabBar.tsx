import { NavLink } from "react-router";
import { Clapperboard, Clock, Search, CalendarDays, User, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { bottomTabClass } from "../nav-utils";

const ICON_SIZE = 20;

export default function BottomTabBar() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

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

            <NavLink to="/browse" className={({ isActive }) => bottomTabClass(isActive)}>
              <Search size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.browse")}</span>
            </NavLink>

            <NavLink to="/calendar" className={({ isActive }) => bottomTabClass(isActive)}>
              <CalendarDays size={ICON_SIZE} aria-hidden="true" />
              <span className="text-[10px] mt-0.5">{t("bottomNav.calendar")}</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => bottomTabClass(isActive)}>
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
