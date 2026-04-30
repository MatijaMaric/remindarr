-- Add target_user_id to recommendations for single-recipient targeting.
-- NULL means broadcast to all followers; non-NULL means direct to one user.
-- Also replaces the (from_user_id, title_id) UNIQUE index with a regular index
-- so the same sender can recommend the same title to multiple different recipients.
ALTER TABLE `recommendations` ADD COLUMN `target_user_id` text REFERENCES `users`(`id`) ON DELETE cascade;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_recommendations_from_title`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_from_title` ON `recommendations` (`from_user_id`, `title_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recommendations_target_user` ON `recommendations` (`target_user_id`);
