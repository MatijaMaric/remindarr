ALTER TABLE `user_achievements` ADD COLUMN `earned_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_achievements` ADD COLUMN `last_earned_at` text;
--> statement-breakpoint
UPDATE `user_achievements` SET `earned_count` = CASE WHEN `earned_at` IS NULL THEN 0 ELSE 1 END, `last_earned_at` = `earned_at` WHERE `earned_count` = 0;
--> statement-breakpoint
ALTER TABLE `achievements` ADD COLUMN `repeatable` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `achievements` ADD COLUMN `tier` text NOT NULL DEFAULT 'one-shot';
--> statement-breakpoint
ALTER TABLE `achievements` ADD COLUMN `family` text;
--> statement-breakpoint
ALTER TABLE `achievements` ADD COLUMN `rung_index` integer;
--> statement-breakpoint
ALTER TABLE `achievements` ADD COLUMN `category` text NOT NULL DEFAULT 'special';
--> statement-breakpoint
CREATE TABLE `user_achievement_earns` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `achievement_key` text NOT NULL,
  `earned_at` text NOT NULL,
  `context` text,
  `notified` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`achievement_key`) REFERENCES `achievements`(`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_uae_user_key_earnedat` ON `user_achievement_earns` (`user_id`, `achievement_key`, `earned_at`);
--> statement-breakpoint
CREATE INDEX `idx_uae_user_earnedat` ON `user_achievement_earns` (`user_id`, `earned_at`);
