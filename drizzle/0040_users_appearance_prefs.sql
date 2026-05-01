-- Add appearance preference columns to users without table recreation.
-- All have NOT NULL DEFAULT so ALTER TABLE ADD COLUMN is safe on SQLite/D1
-- and avoids the Cloudflare D1 cascade-delete risk (see migration safety rules).
ALTER TABLE `users` ADD COLUMN `theme_variant` text NOT NULL DEFAULT 'dark';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `accent_color` text NOT NULL DEFAULT 'amber';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `density` text NOT NULL DEFAULT 'comfortable';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `reduce_motion` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `high_contrast` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `hide_episode_spoilers` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `autoplay_trailers` integer NOT NULL DEFAULT 0;
