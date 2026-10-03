import fs from "node:fs";
import path from "node:path";
import net from "node:net";

fs.mkdirSync(".e2e", { recursive: true });
const directory = fs.mkdtempSync(path.resolve(".e2e/core-"));
Object.assign(process.env, {
  DB_PATH: path.join(directory, "synthetic.db"),
  PORT: "4338",
  BASE_URL: "http://localhost:4337",
  BETTER_AUTH_SECRET: "isolated-core-journey-secret-never-for-deployment",
  TMDB_API_KEY: "synthetic",
  LOG_LEVEL: "error",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  GLOBAL_RATE_LIMIT_PER_MINUTE: "10000",
  TRUSTED_PROXIES: "127.0.0.1,::1,::ffff:127.0.0.1",
  OIDC_ISSUER_URL: "",
  SENTRY_DSN: "",
  BACKUP_DIR: "",
});
const movie = {
  id: 990001,
  media_type: "movie",
  title: "Synthetic Journey",
  original_title: "Synthetic Journey",
  release_date: "2020-01-01",
  runtime: 100,
  overview: "An isolated integration test title.",
  genres: [],
  genre_ids: [],
  original_language: "en",
  poster_path: null,
  backdrop_path: null,
  vote_average: 7,
  vote_count: 100,
  popularity: 1,
  adult: false,
  external_ids: { imdb_id: "tt0990001" },
  "watch/providers": { results: {} },
};
// Only external provider responses are controlled. Browser APIs, authentication,
// routing, database writes, and the production service worker remain real.
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "api.themoviedb.org")
    throw new Error("External traffic disabled in core smoke tests");
  const route = url.pathname;
  const body =
    route === "/3/search/multi"
      ? { results: [movie], page: 1, total_pages: 1, total_results: 1 }
      : route === "/3/movie/990001"
        ? movie
        : route.includes("/genre/")
          ? { genres: [] }
          : route.endsWith("/languages")
            ? []
            : { results: [] };
  return Response.json(body);
}) as typeof fetch;
await import("../../server/index");
const { stopWorker } = await import("../../server/jobs/worker");
stopWorker();

// A transport outage exercises cached navigation without WebKit's broken
// setOffline emulation (microsoft/playwright#42775). Keep the real server and
// worker unchanged; sever both existing and new TCP connections to the origin.
let offline = false;
const connections = new Set<net.Socket>();
net
  .createServer((client) => {
    if (offline) return client.destroy();
    const upstream = net.connect(4338, "127.0.0.1");
    for (const socket of [client, upstream]) {
      connections.add(socket);
      socket.on("error", () => socket.destroy());
      socket.on("close", () => {
        connections.delete(socket);
        client.destroy();
        upstream.destroy();
      });
    }
    client.pipe(upstream).pipe(client);
  })
  .listen(4337);
Bun.serve({
  hostname: "127.0.0.1",
  port: 4339,
  fetch(request) {
    const route = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/offline", "/online"].includes(route))
      return new Response(null, { status: 404 });
    offline = route === "/offline";
    if (offline) for (const socket of connections) socket.destroy();
    return new Response(null, { status: 204 });
  },
});
