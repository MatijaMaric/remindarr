ALTER TABLE `users` ADD COLUMN `profile_visibility` TEXT NOT NULL DEFAULT 'private';--> statement-breakpoint
UPDATE `users` SET `profile_visibility` = CASE WHEN `profile_public` = 1 THEN 'public' ELSE 'private' END;
