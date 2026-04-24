import { Hono } from "hono";
import { z } from "zod";
import { getUserPublicProfile, updateProfilePublic, searchUsers, updateUserBio } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

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

  return ok(c, {
    ...profile,
    is_own_profile: isOwnProfile,
  });
});

export default app;
