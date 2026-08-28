-- Per-user content advisory filter. ALTER TABLE ADD COLUMN with NOT NULL DEFAULT
-- is safe on SQLite/D1 and avoids recreating the users parent table
-- (see server/db/CLAUDE.md migration safety rules).
ALTER TABLE `users` ADD COLUMN `advisory_level` text NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `advisory_allowlist` text NOT NULL DEFAULT '[]';
