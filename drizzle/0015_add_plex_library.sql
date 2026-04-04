CREATE TABLE IF NOT EXISTS `plex_library_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`integration_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title_id` text NOT NULL,
	`rating_key` text NOT NULL,
	`media_type` text NOT NULL,
	`synced_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_plex_library_user_title` ON `plex_library_items` (`user_id`,`title_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_plex_library_integration` ON `plex_library_items` (`integration_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_plex_library_title` ON `plex_library_items` (`title_id`);
