import { Hono } from "hono";
import { getUserPublicProfile, updateProfilePublic } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

app.get("/:username", async (c) => {
  const username = c.req.param("username");
  const profile = await getUserPublicProfile(username);

  if (!profile) {
    return err(c, "User not found", 404);
  }

  const viewer = c.get("user");
  const isOwnProfile = viewer?.username?.toLowerCase() === username.toLowerCase();

  return ok(c, {
    ...profile,
    is_own_profile: isOwnProfile,
  });
});

export default app;
