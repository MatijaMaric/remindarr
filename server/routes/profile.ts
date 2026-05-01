import { Hono } from "hono";
import { z } from "zod";
import {
  getUserPublicProfile,
  updateProfilePublic,
  searchUsers,
  updateUserBio,
  getMyProfile,
  updateMyProfile,
  getUserActivity,
  getUserVisibilityByUsername,
  areMutualFollowers,
  getActivityKindVisibilityMap,
  setActivitySettings,
  getActivitySettings,
  hideActivityEvent,
  unhideActivityEvent,
  getHiddenActivityEventKeys,
  getPinnedTitles,
  pinTitle,
  unpinTitle,
  reorderPinnedTitles,
} from "../db/repository";
import type { AppEnv } from "../types";
import type { ActivityType, ActivityKindVisibilityMap } from "../db/repository";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger";

const log = logger.child({ module: "profile" });

const ACTIVITY_KINDS: ActivityType[] = [
  "rating_title",
  "rating_episode",
  "watched_title",
  "watched_episode",
  "tracked",
  "recommendation",
];

const app = new Hono<AppEnv>();

const bioSchema = z.object({
  bio: z.string().max(280).nullable(),
});

app.patch("/me/bio", zValidator("json", bioSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const { bio } = c.req.valid("json");
  const normalized = bio === null ? null : bio.trim() || null;
  await updateUserBio(user.id, normalized);
  return ok(c, { bio: normalized });
});

const profileSchema = z.object({
  display_name: z.string().max(100).nullable().optional(),
  bio: z.string().max(280).nullable().optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).nullable().optional(),
});

app.get("/me/profile", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const profile = await getMyProfile(user.id);
  return ok(c, profile ?? { display_name: null, bio: null, country_code: null, locale: null });
});

app.patch("/me/profile", zValidator("json", profileSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const body = c.req.valid("json");
  await updateMyProfile(user.id, {
    display_name: body.display_name === undefined ? undefined : (body.display_name === null ? null : body.display_name.trim() || null),
    bio: body.bio === undefined ? undefined : (body.bio === null ? null : body.bio.trim() || null),
    country_code: body.country_code,
    locale: body.locale,
  });
  const profile = await getMyProfile(user.id);
  return ok(c, profile ?? { display_name: null, bio: null, country_code: null, locale: null });
});

const activityKindEnum = z.enum([
  "rating_title",
  "rating_episode",
  "watched_title",
  "watched_episode",
  "tracked",
  "recommendation",
]);
const visibilityEnum = z.enum(["public", "friends_only", "private"]);

const activitySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  kind_visibility: z.partialRecord(activityKindEnum, visibilityEnum).optional(),
});

app.get("/me/activity-settings", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const settings = await getActivitySettings(user.id);
  return ok(c, settings);
});

app.patch("/me/activity-settings", zValidator("json", activitySettingsSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const { enabled, kind_visibility } = c.req.valid("json");
  await setActivitySettings(user.id, {
    enabled,
    kindVisibility: kind_visibility,
  });
  const updated = await getActivitySettings(user.id);
  return ok(c, updated);
});

const hideEventSchema = z.object({
  event_kind: activityKindEnum,
  event_key: z.string().min(1).max(200),
});

app.post("/me/activity/hide", zValidator("json", hideEventSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const { event_kind, event_key } = c.req.valid("json");
  await hideActivityEvent(user.id, event_kind, event_key);
  return ok(c, { hidden: true });
});

app.delete("/me/activity/hide/:event_kind/:event_key", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  const rawKind = c.req.param("event_kind");
  const eventKey = c.req.param("event_key");
  const parsed = activityKindEnum.safeParse(rawKind);
  if (!parsed.success) return err(c, "Invalid event_kind", 400);
  await unhideActivityEvent(user.id, parsed.data, eventKey);
  return ok(c, { hidden: false });
});

app.get("/search", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const query = c.req.query("q");
  if (!query || query.length < 1) {
    return err(c, "Query parameter 'q' is required");
  }

  const users = await searchUsers(query, 10);
  return ok(c, { users });
});

app.get("/:username", async (c) => {
  const username = c.req.param("username");
  const viewer = c.get("user");
  const isOwnProfile = viewer?.username?.toLowerCase() === username.toLowerCase();

  const viewerId = viewer?.id ?? null;
  const profile = await getUserPublicProfile(username, isOwnProfile, viewerId);

  if (!profile) {
    return err(c, "User not found", 404);
  }

  const pinned = await getPinnedTitles(profile.user.id);

  return ok(c, {
    ...profile,
    is_own_profile: isOwnProfile,
    pinned,
  });
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().min(1).optional(),
});

app.get("/:username/activity", zValidator("query", activityQuerySchema), async (c) => {
  const username = c.req.param("username");
  const viewer = c.get("user");
  const profileUser = await getUserVisibilityByUsername(username);
  if (!profileUser) {
    return err(c, "User not found", 404);
  }

  const isOwnProfile = viewer?.id === profileUser.id;

  if (!isOwnProfile && !profileUser.activity_stream_enabled) {
    return ok(c, { activities: [], has_more: false, next_cursor: null });
  }

  let canView: boolean;
  let viewerRelation: "self" | "friend" | "public" = "public";
  if (isOwnProfile) {
    canView = true;
    viewerRelation = "self";
  } else if (profileUser.visibility === "public") {
    canView = true;
    // Check friendship even on public profiles for per-kind visibility to work correctly.
    if (viewer?.id) {
      const mutual = await areMutualFollowers(viewer.id, profileUser.id);
      viewerRelation = mutual ? "friend" : "public";
    }
  } else if (profileUser.visibility === "friends_only" && viewer?.id) {
    const mutual = await areMutualFollowers(viewer.id, profileUser.id);
    canView = mutual;
    viewerRelation = mutual ? "friend" : "public";
  } else {
    canView = false;
  }

  if (!canView) {
    return ok(c, { activities: [], has_more: false, next_cursor: null });
  }

  const { limit, before } = c.req.valid("query");

  const [kindVisibility, hiddenKeys] = await Promise.all([
    isOwnProfile ? Promise.resolve<ActivityKindVisibilityMap>({}) : getActivityKindVisibilityMap(profileUser.id),
    isOwnProfile ? getHiddenActivityEventKeys(profileUser.id) : Promise.resolve(new Set<string>()),
  ]);

  const result = await getUserActivity(profileUser.id, {
    limit,
    before,
    kindVisibility,
    viewerRelation,
    hiddenKeys,
  });
  return ok(c, result);
});

const reorderSchema = z.object({
  titleIds: z.array(z.string().min(1)).min(0).max(8),
});

/** Helper: resolve a username to its user id via the profile, checking ownership. */
async function resolveProfileOwner(username: string, viewerUserId: string) {
  const profile = await getUserPublicProfile(username, false, null);
  if (!profile) return { profile: null, owned: false };
  const owned = profile.user.id === viewerUserId;
  return { profile, owned };
}

// POST /me/pinned/:titleId — pin a title (auth required)
app.post("/me/pinned/:titleId", requireAuth, async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");

  const result = await pinTitle(user.id, titleId);
  if (!result.ok) {
    return err(c, result.error, 400);
  }

  log.info("Title pinned", { userId: user.id, titleId });
  return ok(c, { pinned: true });
});

// DELETE /me/pinned/:titleId — unpin a title (auth required)
app.delete("/me/pinned/:titleId", requireAuth, async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");

  await unpinTitle(user.id, titleId);

  log.info("Title unpinned", { userId: user.id, titleId });
  return ok(c, { pinned: false });
});

// PUT /me/pinned/order — reorder pinned titles (auth required)
app.put("/me/pinned/order", requireAuth, zValidator("json", reorderSchema), async (c) => {
  const user = c.get("user")!;
  const { titleIds } = c.req.valid("json");

  await reorderPinnedTitles(user.id, titleIds);

  log.info("Pinned titles reordered", { userId: user.id, count: titleIds.length });
  return ok(c, { ok: true });
});

export { ACTIVITY_KINDS };
export default app;
