ALTER TABLE `notifiers` ADD COLUMN `quiet_hours_start` text;
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `quiet_hours_end` text;
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `quiet_hours_days` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `leaving_soon_alerts_enabled` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `friend_activity_alerts_enabled` integer NOT NULL DEFAULT 0;
