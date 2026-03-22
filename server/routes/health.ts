import { Hono } from "hono";
import { getDb } from "../db/schema";
import { ok, err } from "./response";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const db = getDb();
    await db.run(/* sql */ `SELECT 1`);
    return ok(c, { status: "ok" });
  } catch {
    return err(c, "Database unavailable", 503);
  }
});

export default app;
