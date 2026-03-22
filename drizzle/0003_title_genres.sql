CREATE TABLE `title_genres` (
	`title_id` text NOT NULL REFERENCES `titles`(`id`) ON DELETE CASCADE,
	`genre` text NOT NULL,
	PRIMARY KEY(`title_id`, `genre`)
);
--> statement-breakpoint
CREATE INDEX `idx_title_genres_genre` ON `title_genres` (`genre`);
--> statement-breakpoint
INSERT INTO `title_genres` (`title_id`, `genre`)
SELECT `titles`.`id`, json_each.value
FROM `titles`, json_each(`titles`.`genres`)
WHERE `titles`.`genres` IS NOT NULL AND `titles`.`genres` != '[]';
--> statement-breakpoint
ALTER TABLE `titles` DROP COLUMN `genres`;
