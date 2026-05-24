import type { UxManifest } from "./constants";

export interface UxRoute {
  /** Filesystem-safe slug used as the artifacts subdirectory name. */
  slug: string;
  /** Resolved URL path to navigate to. */
  path: string;
  /** Which browser context to use when capturing this route. */
  authContext: "authed" | "public";
  /** One-line description for display and issue titles. */
  description: string;
  /** Optional source file path, given to the reviewer agent for context. */
  sourceFile?: string;
  /** True if this route requires the person API mock to be active. */
  mockPerson?: boolean;
}

export function resolveRoutes(m: UxManifest): UxRoute[] {
  return [
    // ─── Public / unauthenticated ────────────────────────────────────────────
    {
      slug: "login",
      path: "/login",
      authContext: "public",
      description: "Login page — username/password + OIDC/passkey toggle",
      sourceFile: "frontend/src/pages/LoginPage.tsx",
    },
    {
      slug: "signup",
      path: "/signup",
      authContext: "public",
      description: "Sign-up page — new account registration",
      sourceFile: "frontend/src/pages/SignupPage.tsx",
    },
    {
      slug: "browse",
      path: "/browse",
      authContext: "public",
      description: "Browse — category search and filters",
      sourceFile: "frontend/src/pages/BrowsePage.tsx",
    },
    {
      slug: "title-movie",
      path: `/title/${m.movieId}`,
      authContext: "public",
      description: "Title detail — movie",
      sourceFile: "frontend/src/pages/TitleDetailPage.tsx",
    },
    {
      slug: "title-show",
      path: `/title/${m.showId}`,
      authContext: "public",
      description: "Title detail — show",
      sourceFile: "frontend/src/pages/TitleDetailPage.tsx",
    },
    {
      slug: "season-detail",
      path: `/title/${m.showId}/season/${m.seasonNumber}`,
      authContext: "public",
      description: "Season detail — episode list",
      sourceFile: "frontend/src/pages/SeasonDetailPage.tsx",
    },
    {
      slug: "episode-detail",
      path: `/title/${m.showId}/season/${m.seasonNumber}/episode/${m.episodeNumber}`,
      authContext: "public",
      description: "Episode detail",
      sourceFile: "frontend/src/pages/EpisodeDetailPage.tsx",
    },
    {
      slug: "person",
      path: `/person/${m.personId}`,
      authContext: "public",
      description: "Person / actor filmography (TMDB-mocked)",
      sourceFile: "frontend/src/pages/PersonPage.tsx",
      mockPerson: true,
    },
    {
      slug: "user-profile",
      path: `/user/${m.username}`,
      authContext: "public",
      description: "User profile page",
      sourceFile: "frontend/src/pages/UserProfilePage.tsx",
    },
    {
      slug: "user-achievements-public",
      path: `/u/${m.username}/achievements`,
      authContext: "public",
      description: "Achievements — public view of another user",
      sourceFile: "frontend/src/pages/AchievementsPage.tsx",
    },
    {
      slug: "achievement-detail-public",
      path: `/u/${m.username}/achievements/${m.achievementKey}`,
      authContext: "public",
      description: "Achievement detail — public view",
      sourceFile: "frontend/src/pages/AchievementDetailPage.tsx",
    },
    {
      slug: "shared-watchlist",
      path: `/share/watchlist/${m.shareToken}`,
      authContext: "public",
      description: "Shared watchlist — public token view",
      sourceFile: "frontend/src/pages/SharedWatchlistPage.tsx",
    },
    {
      slug: "kiosk",
      path: `/kiosk/${m.kioskToken}`,
      authContext: "public",
      description: "Kiosk view — token-gated, no chrome",
      sourceFile: "frontend/src/pages/KioskPage.tsx",
    },
    {
      slug: "not-found",
      path: "/this-route-does-not-exist-404",
      authContext: "public",
      description: "404 not-found page",
      sourceFile: "frontend/src/pages/NotFoundPage.tsx",
    },

    // ─── Authenticated ───────────────────────────────────────────────────────
    {
      slug: "home",
      path: "/",
      authContext: "authed",
      description:
        "Home — desktop landing (desktop redirects here, mobile → /reels)",
      sourceFile: "frontend/src/routes/HomeRoute.tsx",
    },
    {
      slug: "reels",
      path: "/reels",
      authContext: "authed",
      description: "Reels — swipeable mobile discovery",
      sourceFile: "frontend/src/pages/ReelsPage.tsx",
    },
    {
      slug: "more",
      path: "/more",
      authContext: "authed",
      description: "More — mobile-only overflow menu",
      sourceFile: "frontend/src/pages/MorePage.tsx",
    },
    {
      slug: "tracked",
      path: "/tracked",
      authContext: "authed",
      description: "Tracked / watchlist",
      sourceFile: "frontend/src/pages/TrackedPage.tsx",
    },
    {
      slug: "tracked-stats",
      path: "/tracked?view=stats",
      authContext: "authed",
      description: "Tracked — stats view",
      sourceFile: "frontend/src/pages/TrackedPage.tsx",
    },
    {
      slug: "calendar",
      path: "/calendar",
      authContext: "authed",
      description: "Calendar — monthly episode grid",
      sourceFile: "frontend/src/pages/CalendarPage.tsx",
    },
    {
      slug: "discovery",
      path: "/discovery",
      authContext: "authed",
      description: "Discovery — personalised recommendations feed",
      sourceFile: "frontend/src/pages/DiscoveryPage.tsx",
    },
    {
      slug: "invite",
      path: "/invite",
      authContext: "authed",
      description: "Invite — manage invitations",
      sourceFile: "frontend/src/pages/InvitePage.tsx",
    },
    {
      slug: "leaderboard",
      path: "/leaderboard",
      authContext: "authed",
      description: "Leaderboard — user ranking",
      sourceFile: "frontend/src/pages/LeaderboardPage.tsx",
    },
    {
      slug: "achievements",
      path: "/achievements",
      authContext: "authed",
      description: "Achievements — current user",
      sourceFile: "frontend/src/pages/AchievementsPage.tsx",
    },
    {
      slug: "achievement-detail",
      path: `/achievements/${m.achievementKey}`,
      authContext: "authed",
      description: "Achievement detail — current user",
      sourceFile: "frontend/src/pages/AchievementDetailPage.tsx",
    },
    {
      slug: "user-overlap",
      path: `/u/${m.username}/overlap/${m.friendUsername}`,
      authContext: "authed",
      description: "User overlap — watch comparison between two users",
      sourceFile: "frontend/src/pages/UserOverlapPage.tsx",
    },
    {
      slug: "settings",
      path: "/settings",
      authContext: "authed",
      description:
        "Settings — all tabs (account, appearance, integrations, notifications)",
      sourceFile: "frontend/src/pages/SettingsPage.tsx",
    },
    {
      slug: "admin-users",
      path: "/admin/users",
      authContext: "authed",
      description: "Admin — user management (admin-only route)",
      sourceFile: "frontend/src/pages/AdminUsersPage.tsx",
    },
  ];
}
