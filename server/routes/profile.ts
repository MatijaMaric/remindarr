import { Hono } from "hono";
import { getUserPublicProfile, updateProfilePublic, searchUsers } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

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

  const profile = await getUserPublicProfile(username, isOwnProfile);

  if (!profile) {
    return err(c, "User not found", 404);
  }

  return ok(c, {
    ...profile,
    is_own_profile: isOwnProfile,
  });
});

export default app;
