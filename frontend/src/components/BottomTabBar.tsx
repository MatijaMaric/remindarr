import { NavLink } from "react-router";
import { Clapperboard, Clock, Search, CalendarDays, User, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { bottomTabClass } from "../nav-utils";

const ICON_SIZE = 20;

export default function BottomTabBar() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 sm:hidden safe-bottom">
      <div className="flex justify-around">
        {user ? (
          <>
            <NavLink to="/reels" className={({ isActive }) => bottomTabClass(isActive)}>
              <Clapperboard size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Watch</span>
            </NavLink>

            <NavLink to="/upcoming" className={({ isActive }) => bottomTabClass(isActive)}>
              <Clock size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Upcoming</span>
            </NavLink>

            <NavLink to="/browse" className={({ isActive }) => bottomTabClass(isActive)}>
              <Search size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Browse</span>
            </NavLink>

            <NavLink to="/calendar" className={({ isActive }) => bottomTabClass(isActive)}>
              <CalendarDays size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Calendar</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => bottomTabClass(isActive)}>
              <User size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Profile</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/browse" className={({ isActive }) => bottomTabClass(isActive)}>
              <Search size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Browse</span>
            </NavLink>

            <NavLink to="/login" className={({ isActive }) => bottomTabClass(isActive)}>
              <LogIn size={ICON_SIZE} />
              <span className="text-[10px] mt-0.5">Sign In</span>
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
