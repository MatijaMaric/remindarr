import { Routes, Route, NavLink, Link, Navigate, useLocation } from "react-router";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "./context/AuthContext";
import { useIsMobile } from "./hooks/useIsMobile";
import HomePage from "./pages/HomePage";
import BrowsePage from "./pages/BrowsePage";
import TrackedPage from "./pages/TrackedPage";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProfilePage from "./pages/ProfilePage";
import TitleDetailPage from "./pages/TitleDetailPage";
import SeasonDetailPage from "./pages/SeasonDetailPage";
import EpisodeDetailPage from "./pages/EpisodeDetailPage";
import PersonPage from "./pages/PersonPage";
import ReelsPage from "./pages/ReelsPage";
import UpcomingPage from "./pages/UpcomingPage";
import RequireAuth from "./components/RequireAuth";
import BottomTabBar from "./components/BottomTabBar";
import OfflineIndicator from "./components/OfflineIndicator";
import { navLinkClass } from "./nav-utils";

function MobileHomeRedirect() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();

  if (loading) return null;
  if (isMobile && user) return <Navigate to="/reels" replace />;
  return <HomePage />;
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const isReelsPage = location.pathname === "/reels";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-amber-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        {t("nav.skipToMain")}
      </a>
      {/* Hide top nav on reels page for mobile */}
      <nav aria-label="Main navigation" className={`bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50 ${isReelsPage ? "hidden sm:block" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="text-lg font-bold text-white tracking-tight hover:text-amber-400 transition-colors">
            Remindarr
          </Link>
          {/* Desktop nav links */}
          <div className="hidden sm:flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {t("nav.home")}
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {t("nav.browse")}
            </NavLink>
            {user && (
              <>
                <NavLink
                  to="/tracked"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {t("nav.tracked")}
                </NavLink>
                <NavLink
                  to="/calendar"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {t("nav.calendar")}
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
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  {user.display_name || user.username}
                </Link>
                <button
                  onClick={logout}
                  className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {t("nav.signIn")}
              </NavLink>
            )}
          </div>
        </div>
      </nav>
      <main id="main-content" className={isReelsPage ? "" : "max-w-7xl mx-auto px-4 py-6 pb-20 sm:pb-6"}>
        <Routes>
          <Route path="/" element={<MobileHomeRedirect />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/tracked" element={<RequireAuth><TrackedPage /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
          <Route path="/reels" element={<RequireAuth><ReelsPage /></RequireAuth>} />
          <Route path="/upcoming" element={<RequireAuth><UpcomingPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/title/:id" element={<TitleDetailPage />} />
          <Route path="/title/:id/season/:season" element={<SeasonDetailPage />} />
          <Route path="/title/:id/season/:season/episode/:episode" element={<EpisodeDetailPage />} />
          <Route path="/person/:personId" element={<PersonPage />} />
        </Routes>
      </main>
      <BottomTabBar />
      <OfflineIndicator />
      <Toaster theme="dark" position="bottom-center" richColors />
    </div>
  );
}
