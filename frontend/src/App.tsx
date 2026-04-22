import { lazy, Suspense, useState } from "react";
import { Routes, Route, NavLink, Link, Navigate, useLocation, useNavigate } from "react-router";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import BottomTabBar from "./components/BottomTabBar";
import ScrollToTop from "./components/ScrollToTop";
import OfflineIndicator from "./components/OfflineIndicator";
import InstallPrompt from "./components/InstallPrompt";
import NotificationPrompt from "./components/NotificationPrompt";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import { Github, Settings } from "lucide-react";
import { navLinkClass } from "./nav-utils";
import { usePushSubscriptionSync } from "./hooks/usePushSubscriptionSync";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useTheme } from "./hooks/useTheme";

const LAZY_RETRY_KEY = "__lazy_retry";

// Retry dynamic imports on failure (handles stale chunks after deploy).
// Uses sessionStorage to cap retries and prevent infinite reload loops.
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch((importError: unknown) => {
      const retries = parseInt(sessionStorage.getItem(LAZY_RETRY_KEY) ?? "0", 10);
      if (retries < 2) {
        sessionStorage.setItem(LAZY_RETRY_KEY, String(retries + 1));
        window.location.reload();
        // Return a never-resolving promise so React doesn't render before reload
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem(LAZY_RETRY_KEY);
      throw importError;
    })
  );
}

const HomeRoute = lazyWithRetry(() => import("./routes/HomeRoute"));
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
const DiscoveryPage = lazyWithRetry(() => import("./pages/DiscoveryPage"));
const InvitePage = lazyWithRetry(() => import("./pages/InvitePage"));
const AdminUsersPage = lazyWithRetry(() => import("./pages/AdminUsersPage"));
const NotFoundPage = lazyWithRetry(() => import("./pages/NotFoundPage"));
const MorePage = lazyWithRetry(() => import("./pages/MorePage"));

// Wraps a route element in an inline ErrorBoundary so a single page crash
// shows a contained fallback instead of taking down the whole shell.
function Page({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary variant="inline">{children}</ErrorBoundary>;
}

function focusOrNavigateSearch(navigate: ReturnType<typeof useNavigate>, currentPath: string) {
  if (currentPath === "/browse") {
    const input = document.getElementById("search-input") as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
  } else {
    navigate("/browse?focus=search");
  }
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isReelsPage = location.pathname === "/reels";
  usePushSubscriptionSync();

  const { theme } = useTheme();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useKeyboardShortcut("?", () => setShortcutsOpen((v) => !v));
  useKeyboardShortcut("/", () => focusOrNavigateSearch(navigate, location.pathname));

  return (
    <div
      className={`bg-zinc-950 text-zinc-100 ${isReelsPage ? "h-[100dvh] overflow-hidden" : "min-h-screen"}`}
      style={{ background: "var(--bg-app)", color: "var(--text-app)" }}
    >
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-amber-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        {t("nav.skipToMain")}
      </a>
      {/* Hide top nav on reels page for mobile */}
      <nav aria-label="Main navigation" className={`bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50 safe-top ${isReelsPage ? "hidden sm:block" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-8 h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-90 transition-opacity">
            <div className="w-6 h-6 rounded-md bg-amber-400 flex items-center justify-center font-extrabold text-sm text-black leading-none select-none">
              R
            </div>
            <span className="text-base font-bold text-white tracking-tight">Remindarr</span>
          </Link>
          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-6">
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
                  to="/calendar"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {t("nav.calendar")}
                </NavLink>
                <NavLink
                  to="/tracked"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {t("nav.tracked")}
                </NavLink>
                <NavLink
                  to="/discovery"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {t("nav.discovery")}
                </NavLink>
              </>
            )}
          </div>
          <div className="flex-1" />
          {/* ⌘K search trigger */}
          <button
            type="button"
            aria-label="Search (press / or ⌘K)"
            onClick={() => focusOrNavigateSearch(navigate, location.pathname)}
            className="hidden sm:flex items-center gap-2 w-[260px] bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-white/[0.1] transition-colors"
          >
            <span className="opacity-60 text-base leading-none">⌕</span>
            <span className="flex-1 text-left text-[13px]">Search titles, people…</span>
            <span className="font-mono text-[11px] opacity-60">⌘K</span>
          </button>
          {/* Desktop user section */}
          <div className="hidden sm:flex items-center gap-3">
            {loading ? null : user ? (
              <>
                <Link
                  to={`/user/${user.username}`}
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] text-black hover:opacity-80 transition-opacity shrink-0"
                  style={{ background: "oklch(0.6 0.1 250)" }}
                  aria-label={user.display_name || user.username}
                  title={user.display_name || user.username}
                >
                  {(user.display_name || user.username).charAt(0).toUpperCase()}
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
      <ScrollToTop />
      <InstallPrompt />
      <main id="main-content" className={isReelsPage ? "" : "max-w-7xl mx-auto px-4 py-6 pb-20 sm:pb-6"}>
        {user && <NotificationPrompt />}
        <Suspense fallback={<div className="text-center py-12 text-zinc-500">Loading...</div>}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/browse" element={<Page><BrowsePage /></Page>} />
            <Route path="/login" element={<Page><LoginPage /></Page>} />
            <Route path="/signup" element={<Page><SignupPage /></Page>} />
            <Route path="/tracked" element={<RequireAuth><Page><TrackedPage /></Page></RequireAuth>} />
            <Route path="/calendar" element={<RequireAuth><Page><CalendarPage /></Page></RequireAuth>} />
            <Route path="/reels" element={<RequireAuth><Page><ReelsPage /></Page></RequireAuth>} />
            <Route path="/upcoming" element={<RequireAuth><Navigate to="/calendar" replace /></RequireAuth>} />
            <Route path="/more" element={<RequireAuth><Page><MorePage /></Page></RequireAuth>} />
            <Route path="/discovery" element={<RequireAuth><Page><DiscoveryPage /></Page></RequireAuth>} />
            <Route path="/invite" element={<RequireAuth><Page><InvitePage /></Page></RequireAuth>} />
            <Route path="/stats" element={<Navigate to="/tracked?view=stats" replace />} />
            <Route path="/admin/users" element={<RequireAuth><Page><AdminUsersPage /></Page></RequireAuth>} />
            <Route path="/user/:username" element={<Page><UserProfilePage /></Page>} />
            <Route path="/settings" element={<RequireAuth><Page><SettingsPage /></Page></RequireAuth>} />
            <Route path="/profile" element={<Page><ProfilePage /></Page>} />
            <Route path="/title/:id" element={<Page><TitleDetailPage /></Page>} />
            <Route path="/title/:id/season/:season" element={<Page><SeasonDetailPage /></Page>} />
            <Route path="/title/:id/season/:season/episode/:episode" element={<Page><EpisodeDetailPage /></Page>} />
            <Route path="/person/:personId" element={<Page><PersonPage /></Page>} />
            <Route path="*" element={<Page><NotFoundPage /></Page>} />
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
      <Toaster theme={theme === "light" ? "light" : "dark"} position="bottom-center" richColors />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
