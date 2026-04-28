CREATE TABLE IF NOT EXISTS `notification_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notifier_id` text NOT NULL,
	`attempted_at` integer NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer,
	`http_status` integer,
	`error_message` text,
	`event_kind` text,
	FOREIGN KEY (`notifier_id`) REFERENCES `notifiers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notification_log_notifier` ON `notification_log` (`notifier_id`,`attempted_at`);
