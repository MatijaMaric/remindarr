import { Hono } from "hono";
import { getDb } from "../db/schema";

const app = new Hono();

app.get("/", (c) => {
  try {
    const db = getDb();
    db.run(/* sql */ `SELECT 1`);
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "error" }, 503);
  }
});

export default app;
