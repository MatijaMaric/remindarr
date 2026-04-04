CREATE TABLE IF NOT EXISTS `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer NOT NULL DEFAULT 1,
	`last_sync_at` text,
	`last_sync_error` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_integrations_user_id` ON `integrations` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_integrations_provider` ON `integrations` (`provider`);
