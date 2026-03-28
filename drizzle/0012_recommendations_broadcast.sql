-- Recreate recommendations table without to_user_id and read_at,
-- with unique constraint on (from_user_id, title_id).
DROP TABLE IF EXISTS `recommendations`;
--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`title_id` text NOT NULL,
	`message` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_recommendations_from_title` ON `recommendations` (`from_user_id`, `title_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_from_user` ON `recommendations` (`from_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recommendation_reads` (
	`recommendation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`recommendation_id`, `user_id`),
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
