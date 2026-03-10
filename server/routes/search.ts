import { Hono } from "hono";
import { searchTitles } from "../justwatch/client";

const app = new Hono();

app.get("/", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  try {
    const titles = await searchTitles(query);
    return c.json({ titles, count: titles.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
