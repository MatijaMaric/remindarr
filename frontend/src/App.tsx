import { useState, useEffect } from "react";
import { Routes, Route, NavLink, Link, useLocation } from "react-router";
import { Menu, X, Clapperboard } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import HomePage from "./pages/HomePage";
import BrowsePage from "./pages/BrowsePage";
import TrackedPage from "./pages/TrackedPage";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import TitleDetailPage from "./pages/TitleDetailPage";
import SeasonDetailPage from "./pages/SeasonDetailPage";
import EpisodeDetailPage from "./pages/EpisodeDetailPage";
import PersonPage from "./pages/PersonPage";
import ReelsPage from "./pages/ReelsPage";
import RequireAuth from "./components/RequireAuth";
import { navLinkClass } from "./nav-utils";

export default function App() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="text-lg font-bold text-white tracking-tight hover:text-indigo-400 transition-colors">Remindarr</Link>
          {/* Desktop nav links */}
          <div className="hidden sm:flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => navLinkClass(isActive)}
            >
              Home
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) => navLinkClass(isActive)}
            >
              Browse
            </NavLink>
            {user && (
              <>
                <NavLink
                  to="/tracked"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Tracked
                </NavLink>
                <NavLink
                  to="/calendar"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Calendar
                </NavLink>
                <NavLink
                  to="/reels"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Reels
                </NavLink>
              </>
            )}
          </div>
          {/* Desktop user section */}
          <div className="hidden sm:flex items-center gap-3">
            {loading ? null : user ? (
              <>
                <Link
                  to="/profile"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {user.display_name || user.username}
                </Link>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign In
              </NavLink>
            )}
          </div>
          {/* Mobile hamburger button */}
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="sm:hidden p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => navLinkClass(isActive, true)}
            >
              Home
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) => navLinkClass(isActive, true)}
            >
              Browse
            </NavLink>
            {user && (
              <>
                <NavLink
                  to="/tracked"
                  className={({ isActive }) => navLinkClass(isActive, true)}
                >
                  Tracked
                </NavLink>
                <NavLink
                  to="/calendar"
                  className={({ isActive }) => navLinkClass(isActive, true)}
                >
                  Calendar
                </NavLink>
                <NavLink
                  to="/reels"
                  className={({ isActive }) => navLinkClass(isActive, true)}
                >
                  <Clapperboard size={16} className="inline mr-1" />
                  Reels
                </NavLink>
              </>
            )}
            <div className="border-t border-gray-800 my-2" />
            {loading ? null : user ? (
              <>
                <Link
                  to="/profile"
                  className="block w-full px-3 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {user.display_name || user.username}
                </Link>
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2.5 text-sm text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                className="block w-full px-3 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign In
              </NavLink>
            )}
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tracked" element={<RequireAuth><TrackedPage /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
          <Route path="/reels" element={<RequireAuth><ReelsPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/title/:id" element={<TitleDetailPage />} />
          <Route path="/title/:id/season/:season" element={<SeasonDetailPage />} />
          <Route path="/title/:id/season/:season/episode/:episode" element={<EpisodeDetailPage />} />
          <Route path="/person/:personId" element={<PersonPage />} />
        </Routes>
      </main>
    </div>
  );
}
