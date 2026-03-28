CREATE TABLE IF NOT EXISTS `follows` (
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`follower_id`, `following_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_follows_following` ON `follows` (`following_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ratings` (
	`user_id` text NOT NULL,
	`title_id` text NOT NULL,
	`rating` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`user_id`, `title_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ratings_title` ON `ratings` (`title_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`title_id` text NOT NULL,
	`message` text,
	`created_at` text DEFAULT (datetime('now')),
	`read_at` text,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_to_user` ON `recommendations` (`to_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_from_user` ON `recommendations` (`from_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_by_id` text NOT NULL,
	`used_by_id` text,
	`created_at` text DEFAULT (datetime('now')),
	`used_at` text,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `invitations_code_unique` ON `invitations` (`code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invitations_code` ON `invitations` (`code`);
