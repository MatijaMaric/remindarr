import { Hono } from "hono";
import { z } from "zod";
import {
  getUserByWatchlistShareToken,
  getWatchlistShareToken,
  setWatchlistShareToken,
  getTrackedTitles,
} from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { zValidator } from "../lib/validator";
import { logger } from "../logger";
import type { AppEnv } from "../types";

const log = logger.child({ module: "share" });

// Share tokens are 32-char hex (crypto.randomUUID() with dashes stripped).
const shareTokenParam = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) });

const app = new Hono<AppEnv>();

// GET /api/share/token  (requireAuth)
app.get("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = await getWatchlistShareToken(user.id);
  return c.json({ token });
});

// POST /api/share/token  (requireAuth)
app.post("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = crypto.randomUUID().replace(/-/g, "");
  await setWatchlistShareToken(user.id, token);
  log.info("Watchlist share token generated", { userId: user.id });
  return c.json({ token });
});

// DELETE /api/share/token  (requireAuth)
app.delete("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  await setWatchlistShareToken(user.id, null);
  log.info("Watchlist share token revoked", { userId: user.id });
  return c.json({ success: true });
});

// GET /api/share/watchlist/:token  (public)
app.get(
  "/watchlist/:token",
  zValidator("param", shareTokenParam),
  async (c) => {
    const { token } = c.req.valid("param");
    const user = await getUserByWatchlistShareToken(token);
    if (!user) {
      return c.json({ error: "Not found" }, 404);
    }
    const titles = await getTrackedTitles(user.id);
    const username = user.displayUsername ?? user.username;
    log.debug("Shared watchlist served", {
      userId: user.id,
      count: titles.length,
    });
    return c.json({ username, titles });
  },
);

export default app;
