import path from "node:path";
import fs from "node:fs";
import { getRawDb } from "../db/bun-db";
import { logger } from "../logger";
import { CONFIG } from "../config";
import { registerHandler } from "./worker";
import { registerCron } from "./queue";

const log = logger.child({ module: "backup" });

const BACKUP_FILE_PATTERN = /^remindarr-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

/**
 * Creates a backup of the SQLite database using VACUUM INTO and prunes old backups.
 * Returns the backup path and the number of old backups pruned.
 */
export async function runBackup(): Promise<{ path: string; pruned: number }> {
  const backupDir = CONFIG.BACKUP_DIR;
  if (!backupDir) {
    log.info("Skipping backup", { reason: "BACKUP_DIR not configured" });
    return { path: "", pruned: 0 };
  }

  fs.mkdirSync(backupDir, { recursive: true });

  // Build a timestamped filename with only safe characters
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(".", "-");
  const backupPath = path.join(path.resolve(backupDir), `remindarr-${timestamp}.db`);

  // VACUUM INTO creates a defragmented, consistent snapshot of the database.
  // The path is constructed from server-controlled values (env var + timestamp),
  // not from user input, so string interpolation is safe here.
  const db = getRawDb();
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  log.info("Database backup created", { path: backupPath });

  // Prune oldest backups beyond the retention limit
  const entries = fs
    .readdirSync(backupDir)
    .filter((f) => BACKUP_FILE_PATTERN.test(f))
    .sort(); // ISO timestamps sort lexicographically

  const retain = CONFIG.BACKUP_RETAIN;
  const toDelete = entries.slice(0, Math.max(0, entries.length - retain));
  for (const name of toDelete) {
    const filePath = path.join(backupDir, name);
    fs.unlinkSync(filePath);
    log.info("Pruned old backup", { path: filePath });
  }

  return { path: backupPath, pruned: toDelete.length };
}

export function registerBackupJob() {
  if (!CONFIG.BACKUP_DIR) {
    log.info("Backup job disabled", { reason: "BACKUP_DIR not configured" });
    return;
  }

  registerHandler("backup-db", async () => {
    const result = await runBackup();
    log.info("Backup complete", { path: result.path, pruned: result.pruned });
  });

  registerCron("backup-db", CONFIG.BACKUP_CRON);
}
