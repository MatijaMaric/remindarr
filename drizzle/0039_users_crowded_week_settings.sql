-- Add crowded_week_threshold and crowded_week_badge_enabled to users without
-- table recreation. Both columns have NOT NULL DEFAULT so ALTER TABLE ADD COLUMN
-- is safe on SQLite/D1 and avoids the Cloudflare D1 cascade-delete risk.
ALTER TABLE `users` ADD COLUMN `crowded_week_threshold` integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `crowded_week_badge_enabled` integer NOT NULL DEFAULT 1;
