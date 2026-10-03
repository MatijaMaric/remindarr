CREATE TABLE `owned_media` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
	`format` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`user_id`, `title_id`, `format`)
);
