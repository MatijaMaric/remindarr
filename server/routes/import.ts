import { Hono } from "hono";
import { resolveImdbUrl } from "../imdb/resolver";
import { upsertTitles, trackTitle } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { logger } from "../logger";

const log = logger.child({ module: "import" });

const MAX_ROWS = 500;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export type CsvFormat = "letterboxd" | "imdb" | "trakt" | "unknown";

/**
 * Parse a CSV string into an array of objects keyed by header row.
 * Handles quoted fields (including fields containing commas and newlines).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvRow(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

/** Split CSV text into logical lines, respecting quoted multi-line fields. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Handle escaped quotes ""
      if (inQuote && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
        current += ch;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

/** Parse a single CSV row into fields, handling quoted fields. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Detect CSV format from header names. */
export function detectCsvFormat(headers: string[]): CsvFormat {
  const set = new Set(headers.map((h) => h.trim()));
  // Letterboxd: Name, Year, Letterboxd URI
  if (set.has("Name") && set.has("Year") && set.has("Letterboxd URI")) {
    return "letterboxd";
  }
  // IMDB: Const, Your Rating, Title Type
  if (set.has("Const") && set.has("Your Rating") && set.has("Title Type")) {
    return "imdb";
  }
  // Trakt: imdb_id, tmdb_id, title, type
  if (set.has("imdb_id") && set.has("tmdb_id") && set.has("title") && set.has("type")) {
    return "trakt";
  }
  return "unknown";
}

/**
 * Extract an IMDB ID from a CSV row depending on the detected format.
 * Returns null if the row doesn't have a valid IMDB ID.
 */
export function extractImdbIdFromRow(row: Record<string, string>, format: CsvFormat): string | null {
  switch (format) {
    case "letterboxd": {
      // Letterboxd URI looks like https://letterboxd.com/film/...
      // The IMDB ID isn't in the CSV directly, but some exports include it in
      // an "IMDB URI" or "IMDb" column. Otherwise we use the Letterboxd URI
      // column as identifier — but we can only resolve via IMDB ID.
      // Letterboxd does export an "IMDB URI" column in watchlist/ratings CSVs.
      const imdbUri = row["IMDB URI"] ?? row["IMDb URI"] ?? row["Imdb URI"] ?? "";
      if (imdbUri) {
        const match = imdbUri.match(/tt\d+/);
        if (match) return match[0];
      }
      // Some Letterboxd exports embed IMDB ID in a separate column
      const imdbId = row["IMDb ID"] ?? row["IMDB ID"] ?? row["imdb_id"] ?? "";
      const idMatch = imdbId.match(/tt\d+/);
      if (idMatch) return idMatch[0];
      return null;
    }
    case "imdb": {
      // "Const" column contains the IMDB ID (e.g. tt1234567)
      const constVal = (row["Const"] ?? "").trim();
      if (/^tt\d+$/.test(constVal)) return constVal;
      return null;
    }
    case "trakt": {
      const imdbId = (row["imdb_id"] ?? "").trim();
      if (/^tt\d+$/.test(imdbId)) return imdbId;
      return null;
    }
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const app = new Hono<AppEnv>();

app.post("/csv", async (c) => {
  const user = c.get("user")!;

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return err(c, "Expected multipart form data with a 'file' field");
  }

  const fileField = formData.get("file");
  if (!fileField || typeof fileField === "string") {
    return err(c, "Missing 'file' field in form data");
  }

  const file = fileField as File;
  if (file.size > MAX_FILE_SIZE) {
    return err(c, "File too large. Maximum allowed size is 5 MB.");
  }
  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return err(c, "Failed to read uploaded file");
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return err(c, "CSV file is empty or has no data rows");
  }

  const headers = Object.keys(rows[0]);
  const format = detectCsvFormat(headers);
  if (format === "unknown") {
    return err(c, "Unrecognized CSV format. Supported formats: Letterboxd, IMDB, Trakt");
  }

  log.info("CSV import started", { format, totalRows: rows.length, userId: user.id });

  const limitedRows = rows.slice(0, MAX_ROWS);
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let batchStart = 0; batchStart < limitedRows.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) {
      await sleep(BATCH_DELAY_MS);
    }

    const batch = limitedRows.slice(batchStart, batchStart + BATCH_SIZE);

    for (const row of batch) {
      const imdbId = extractImdbIdFromRow(row, format);
      if (!imdbId) {
        skipped++;
        continue;
      }

      try {
        const title = await resolveImdbUrl(imdbId);
        if (!title) {
          failed++;
          errors.push(`Could not resolve IMDB ID: ${imdbId}`);
          continue;
        }

        await upsertTitles([title]);
        await trackTitle(title.id, user.id);
        imported++;
        log.info("Imported title from CSV", { imdbId, titleId: title.id, title: title.title });
      } catch (e: unknown) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Failed to import ${imdbId}: ${msg}`);
        log.warn("Failed to import CSV row", { imdbId, err: msg });
      }
    }
  }

  const totalSkippedRows = rows.length > MAX_ROWS ? rows.length - MAX_ROWS : 0;
  skipped += totalSkippedRows;

  log.info("CSV import complete", { format, imported, failed, skipped, userId: user.id });

  return ok(c, { imported, failed, skipped, errors });
});

export default app;
