export const UX_DB_DIR = ".ux-review";
export const UX_DB_PATH = `${UX_DB_DIR}/remindarr.sqlite`;
export const UX_MANIFEST_PATH = `${UX_DB_DIR}/manifest.json`;
export const UX_AUTH_STATE_PATH = `${UX_DB_DIR}/auth.json`;
export const UX_ARTIFACTS_DIR = `${UX_DB_DIR}/artifacts`;
export const UX_PORT = 3100;
export const UX_BASE_URL = `http://localhost:${UX_PORT}`;

export const VIEWPORTS = [
  { width: 320, height: 568, label: "320x568" },
  { width: 375, height: 812, label: "375x812" },
  { width: 640, height: 1024, label: "640x1024" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1920, height: 1080, label: "1920x1080" },
] as const;

export type Viewport = (typeof VIEWPORTS)[number];

export interface UxManifest {
  username: string;
  password: string;
  friendUsername: string;
  movieId: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  personId: number;
  kioskToken: string;
  shareToken: string;
  achievementKey: string;
}
