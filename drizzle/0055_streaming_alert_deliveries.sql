CREATE TABLE `streaming_alert_deliveries` (
  `notifier_id` text NOT NULL REFERENCES `notifiers`(`id`) ON DELETE CASCADE,
  `title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
  `provider_id` integer NOT NULL,
  `kind` text NOT NULL,
  PRIMARY KEY (`notifier_id`, `title_id`, `provider_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `idx_streaming_deliveries_event` ON `streaming_alert_deliveries` (`title_id`, `provider_id`, `kind`, `notifier_id`);
--> statement-breakpoint
ALTER TABLE `streaming_alerts` ADD COLUMN `delivery_completed` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `notifiers` ADD COLUMN `schedule_started_at` text;
