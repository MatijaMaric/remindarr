import { lazy, Suspense } from "react";
import { Routes, Route, NavLink, Link, Navigate, useLocation } from "react-router";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "./context/AuthContext";
import { useIsMobile } from "./hooks/useIsMobile";
import RequireAuth from "./components/RequireAuth";
import BottomTabBar from "./components/BottomTabBar";
import OfflineIndicator from "./components/OfflineIndicator";
import InstallPrompt from "./components/InstallPrompt";
import NotificationPrompt from "./components/NotificationPrompt";
import { Github, Settings } from "lucide-react";
import { navLinkClass } from "./nav-utils";

// Retry dynamic imports once on failure (handles stale chunks after deploy)
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch(() => {
      // Chunk likely changed after a new deploy — reload to get fresh assets
      window.location.reload();
      // Return a never-resolving promise so React doesn't render before reload
      return new Promise(() => {});
    })
  );
}

const HomePage = lazyWithRetry(() => import("./pages/HomePage"));
const BrowsePage = lazyWithRetry(() => import("./pages/BrowsePage"));
const TrackedPage = lazyWithRetry(() => import("./pages/TrackedPage"));
const CalendarPage = lazyWithRetry(() => import("./pages/CalendarPage"));
const LoginPage = lazyWithRetry(() => import("./pages/LoginPage"));
const SignupPage = lazyWithRetry(() => import("./pages/SignupPage"));
const ProfilePage = lazyWithRetry(() => import("./pages/ProfilePage"));
const UserProfilePage = lazyWithRetry(() => import("./pages/UserProfilePage"));
const SettingsPage = lazyWithRetry(() => import("./pages/SettingsPage"));
const TitleDetailPage = lazyWithRetry(() => import("./pages/TitleDetailPage"));
const SeasonDetailPage = lazyWithRetry(() => import("./pages/SeasonDetailPage"));
const EpisodeDetailPage = lazyWithRetry(() => import("./pages/EpisodeDetailPage"));
const PersonPage = lazyWithRetry(() => import("./pages/PersonPage"));
const ReelsPage = lazyWithRetry(() => import("./pages/ReelsPage"));
const UpcomingPage = lazyWithRetry(() => import("./pages/UpcomingPage"));
const DiscoveryPage = lazyWithRetry(() => import("./pages/DiscoveryPage"));

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
    <div className={`bg-zinc-950 text-zinc-100 ${isReelsPage ? "h-[100dvh] overflow-hidden" : "min-h-screen"}`}>
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-amber-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        {t("nav.skipToMain")}
      </a>
      {/* Hide top nav on reels page for mobile */}
      <nav aria-label="Main navigation" className={`bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50 safe-top ${isReelsPage ? "hidden sm:block" : ""}`}>
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
                  to={`/user/${user.username}`}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  {user.display_name || user.username}
                </Link>
                <Link
                  to="/settings"
                  className="text-zinc-400 hover:text-white transition-colors"
                  aria-label={t("nav.settings")}
                >
                  <Settings className="size-4" />
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
      <InstallPrompt />
      <main id="main-content" className={isReelsPage ? "" : "max-w-7xl mx-auto px-4 py-6 pb-20 sm:pb-6"}>
        {user && <NotificationPrompt />}
        <Suspense fallback={<div className="text-center py-12 text-zinc-500">Loading...</div>}>
          <Routes>
            <Route path="/" element={<MobileHomeRedirect />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/tracked" element={<RequireAuth><TrackedPage /></RequireAuth>} />
            <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
            <Route path="/reels" element={<RequireAuth><ReelsPage /></RequireAuth>} />
            <Route path="/upcoming" element={<RequireAuth><UpcomingPage /></RequireAuth>} />
            <Route path="/discovery" element={<RequireAuth><DiscoveryPage /></RequireAuth>} />
            <Route path="/user/:username" element={<UserProfilePage />} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/title/:id" element={<TitleDetailPage />} />
            <Route path="/title/:id/season/:season" element={<SeasonDetailPage />} />
            <Route path="/title/:id/season/:season/episode/:episode" element={<EpisodeDetailPage />} />
            <Route path="/person/:personId" element={<PersonPage />} />
          </Routes>
        </Suspense>
      </main>
      <footer className={`border-t border-white/[0.06] py-6 mt-8 ${isReelsPage ? "hidden" : "hidden sm:block"}`}>
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-sm text-zinc-500">
          <span>&copy; {new Date().getFullYear()} Remindarr</span>
          <a
            href="https://github.com/MatijaMaric/remindarr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors"
          >
            <Github className="size-4" />
            GitHub
          </a>
        </div>
      </footer>
      <BottomTabBar />
      <OfflineIndicator />
      <Toaster theme="dark" position="bottom-center" richColors />
    </div>
  );
}
