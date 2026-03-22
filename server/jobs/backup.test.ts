import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { CONFIG } from "../config";
import { runBackup } from "./backup";

describe("runBackup", () => {
  let tmpDir: string;
  let originalBackupDir: string;
  let originalBackupRetain: number;

  beforeEach(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remindarr-backup-test-"));
    originalBackupDir = CONFIG.BACKUP_DIR;
    originalBackupRetain = CONFIG.BACKUP_RETAIN;
  });

  afterEach(() => {
    CONFIG.BACKUP_DIR = originalBackupDir;
    CONFIG.BACKUP_RETAIN = originalBackupRetain;
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips backup when BACKUP_DIR is not configured", async () => {
    CONFIG.BACKUP_DIR = "";
    const result = await runBackup();
    expect(result.path).toBe("");
    expect(result.pruned).toBe(0);
  });

  it("creates a backup file in the configured directory", async () => {
    CONFIG.BACKUP_DIR = tmpDir;
    const result = await runBackup();

    expect(result.path).toStartWith(tmpDir);
    expect(result.path).toMatch(/remindarr-.*\.db$/);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it("creates the backup directory if it does not exist", async () => {
    const nested = path.join(tmpDir, "nested", "backups");
    CONFIG.BACKUP_DIR = nested;
    const result = await runBackup();

    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it("prunes old backups beyond BACKUP_RETAIN", async () => {
    CONFIG.BACKUP_DIR = tmpDir;
    CONFIG.BACKUP_RETAIN = 2;

    // Create fake old backup files with earlier timestamps
    const oldFiles = [
      "remindarr-2026-01-01T00-00-00-000Z.db",
      "remindarr-2026-01-02T00-00-00-000Z.db",
      "remindarr-2026-01-03T00-00-00-000Z.db",
    ];
    for (const f of oldFiles) {
      fs.writeFileSync(path.join(tmpDir, f), "");
    }

    const result = await runBackup();

    // After backup: 3 old + 1 new = 4 total, retain 2 → pruned 2
    expect(result.pruned).toBe(2);

    // The two oldest should be deleted
    expect(fs.existsSync(path.join(tmpDir, oldFiles[0]))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, oldFiles[1]))).toBe(false);

    // The new backup and the most recent old file should remain
    expect(fs.existsSync(path.join(tmpDir, oldFiles[2]))).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it("does not prune when backup count is within BACKUP_RETAIN limit", async () => {
    CONFIG.BACKUP_DIR = tmpDir;
    CONFIG.BACKUP_RETAIN = 7;

    const result = await runBackup();

    expect(result.pruned).toBe(0);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it("only prunes files matching the backup filename pattern", async () => {
    CONFIG.BACKUP_DIR = tmpDir;
    CONFIG.BACKUP_RETAIN = 1;

    // These files should NOT be pruned (wrong pattern)
    const unrelatedFiles = ["other.db", "remindarr.db", "backup.txt"];
    for (const f of unrelatedFiles) {
      fs.writeFileSync(path.join(tmpDir, f), "");
    }

    // One valid old backup that SHOULD be pruned
    const oldBackup = "remindarr-2026-01-01T00-00-00-000Z.db";
    fs.writeFileSync(path.join(tmpDir, oldBackup), "");

    const result = await runBackup();

    // Old backup pruned, unrelated files untouched
    expect(result.pruned).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, oldBackup))).toBe(false);
    for (const f of unrelatedFiles) {
      expect(fs.existsSync(path.join(tmpDir, f))).toBe(true);
    }
  });
});
