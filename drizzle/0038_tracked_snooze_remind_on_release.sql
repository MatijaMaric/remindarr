-- Add snooze_until and remind_on_release to tracked without table recreation.
-- Both columns have suitable defaults so ALTER TABLE ADD COLUMN is safe on SQLite/D1.
ALTER TABLE `tracked` ADD COLUMN `snooze_until` text;
--> statement-breakpoint
ALTER TABLE `tracked` ADD COLUMN `remind_on_release` integer NOT NULL DEFAULT 0;
