CREATE TABLE IF NOT EXISTS `person_follows` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`person_id` integer NOT NULL,
	`name` text NOT NULL,
	`profile_path` text,
	`seen_credits` text NOT NULL DEFAULT '[]',
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`user_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_person_follows_person` ON `person_follows` (`person_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `person_credit_alerts` (
	`notifier_id` text NOT NULL REFERENCES `notifiers`(`id`) ON DELETE CASCADE,
	`person_id` integer NOT NULL,
	`credit_key` text NOT NULL,
	`person_name` text NOT NULL,
	`title` text NOT NULL,
	`role` text,
	`release_date` text,
	`poster_path` text,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`notifier_id`, `person_id`, `credit_key`)
);
