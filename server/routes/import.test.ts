import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import * as resolver from "../imdb/resolver";
import * as repository from "../db/repository";
import type { AppEnv } from "../types";
import { parseCsv, detectCsvFormat, extractImdbIdFromRow, type CsvFormat } from "./import";

// ─── Auth helper ───────────────────────────────────────────────────────────

function createMockAuth() {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const cookieHeader = headers.get("cookie") || "";
        const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
        const token = match?.[1];
        if (!token) return null;
        const user = await getSessionWithUser(token);
        if (!user) return null;
        return {
          session: { id: "session-id", userId: user.id },
          user: {
            id: user.id,
            name: user.display_name,
            username: user.username,
            role: user.role || (user.is_admin ? "admin" : "user"),
          },
        };
      },
    },
  };
}

// ─── CSV unit tests ─────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    const csv = "Name,Year\nInception,2010\nDune,2021";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Inception", Year: "2010" });
    expect(rows[1]).toEqual({ Name: "Dune", Year: "2021" });
  });

  it("handles quoted fields with commas", () => {
    const csv = `Title,Note\n"Hello, World",Test`;
    const rows = parseCsv(csv);
    expect(rows[0]["Title"]).toBe("Hello, World");
  });

  it("returns empty array for header-only CSV", () => {
    const rows = parseCsv("Name,Year\n");
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseCsv("")).toHaveLength(0);
  });
});

describe("detectCsvFormat", () => {
  it("detects Letterboxd format", () => {
    const headers = ["Name", "Year", "Letterboxd URI", "Rating", "Watched Date"];
    expect(detectCsvFormat(headers)).toBe("letterboxd");
  });

  it("detects IMDB format", () => {
    const headers = ["Const", "Your Rating", "Date Rated", "Title", "Title Type"];
    expect(detectCsvFormat(headers)).toBe("imdb");
  });

  it("detects Trakt format", () => {
    const headers = ["imdb_id", "tmdb_id", "title", "type", "listed_at"];
    expect(detectCsvFormat(headers)).toBe("trakt");
  });

  it("returns unknown for unrecognized headers", () => {
    expect(detectCsvFormat(["foo", "bar", "baz"])).toBe("unknown");
  });
});

describe("extractImdbIdFromRow", () => {
  it("extracts IMDB ID from Letterboxd row via IMDB URI column", () => {
    const row = {
      Name: "Inception",
      Year: "2010",
      "Letterboxd URI": "https://letterboxd.com/film/inception/",
      "IMDB URI": "https://www.imdb.com/title/tt1375666/",
    };
    expect(extractImdbIdFromRow(row, "letterboxd")).toBe("tt1375666");
  });

  it("extracts IMDB ID from IMDB row via Const column", () => {
    const row = {
      Const: "tt1375666",
      "Your Rating": "9",
      "Date Rated": "2024-01-01",
      Title: "Inception",
      "Title Type": "movie",
    };
    expect(extractImdbIdFromRow(row, "imdb")).toBe("tt1375666");
  });

  it("returns null for IMDB row with invalid Const value", () => {
    const row = { Const: "nm0000093", "Your Rating": "9", "Date Rated": "", Title: "Brad Pitt", "Title Type": "name" };
    expect(extractImdbIdFromRow(row, "imdb")).toBeNull();
  });

  it("extracts IMDB ID from Trakt row", () => {
    const row = {
      imdb_id: "tt1375666",
      tmdb_id: "27205",
      title: "Inception",
      type: "movie",
      listed_at: "2024-01-01",
    };
    expect(extractImdbIdFromRow(row, "trakt")).toBe("tt1375666");
  });

  it("returns null for Trakt row with empty imdb_id", () => {
    const row = { imdb_id: "", tmdb_id: "27205", title: "Inception", type: "movie" };
    expect(extractImdbIdFromRow(row, "trakt")).toBeNull();
  });

  it("returns null for unknown format", () => {
    const row = { foo: "bar" };
    expect(extractImdbIdFromRow(row, "unknown" as CsvFormat)).toBeNull();
  });
});

// ─── HTTP endpoint tests ─────────────────────────────────────────────────────

let app: Hono<AppEnv>;
let userCookie: string;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  spies = [
    spyOn(resolver, "resolveImdbUrl").mockResolvedValue(makeParsedTitle()),
    spyOn(repository, "upsertTitles").mockImplementation(async () => 0),
    spyOn(repository, "trackTitle").mockImplementation(async () => {}),
  ];

  const userId = await createUser("csvuser", "hash");
  const token = await createSession(userId);
  userCookie = `better-auth.session_token=${token}`;

  const importApp = (await import("./import")).default;
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/import/*", requireAuth);
  app.use("/import", requireAuth);
  app.route("/import", importApp);
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

function makeFormData(csvContent: string, filename = "test.csv"): FormData {
  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), filename);
  return form;
}

describe("POST /import/csv", () => {
  it("returns 401 without auth", async () => {
    const form = makeFormData("Const,Title\ntt1234567,Inception");
    const res = await app.request("/import/csv", { method: "POST", body: form });
    expect(res.status).toBe(401);
  });

  it("returns 400 when file field is missing", async () => {
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing 'file'");
  });

  it("returns 400 for unrecognized CSV format", async () => {
    const csv = "foo,bar\n1,2";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unrecognized CSV format");
  });

  it("imports a valid IMDB CSV", async () => {
    const title = makeParsedTitle({ id: "movie-imdb-1", title: "Inception" });
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(title);

    const csv = "Const,Your Rating,Date Rated,Title,Title Type\ntt1375666,9,2024-01-01,Inception,movie";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it("imports a valid Trakt CSV", async () => {
    const title = makeParsedTitle({ id: "movie-trakt-1", title: "Dune" });
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(title);

    const csv = "imdb_id,tmdb_id,title,type,listed_at\ntt1160419,438631,Dune,movie,2024-01-01";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it("imports a valid Letterboxd CSV (with IMDB URI)", async () => {
    const title = makeParsedTitle({ id: "movie-lb-1", title: "Parasite" });
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(title);

    const csv = "Date,Name,Year,Letterboxd URI,Rating,Watched Date,IMDB URI\n2024-01-01,Parasite,2019,https://letterboxd.com/film/parasite-2019/,5,2024-01-01,https://www.imdb.com/title/tt6751668/";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("counts rows without IMDB ID as skipped", async () => {
    // Trakt row with empty imdb_id
    const csv = "imdb_id,tmdb_id,title,type\n,438631,Dune,movie";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });

  it("counts rows where resolver returns null as failed", async () => {
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(null);

    const csv = "Const,Your Rating,Date Rated,Title,Title Type\ntt9999999,5,2024-01-01,Unknown,movie";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.errors).toHaveLength(1);
  });

  it("returns errors array with details for failed rows", async () => {
    (resolver.resolveImdbUrl as any).mockRejectedValueOnce(new Error("TMDB timeout"));

    const csv = "Const,Your Rating,Date Rated,Title,Title Type\ntt0000001,5,2024-01-01,Ghost,movie";
    const form = makeFormData(csv);
    const res = await app.request("/import/csv", {
      method: "POST",
      headers: { Cookie: userCookie },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.errors[0]).toContain("TMDB timeout");
  });
});
