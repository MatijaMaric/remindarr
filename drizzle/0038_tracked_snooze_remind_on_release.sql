ALTER TABLE `tracked` ADD `snooze_until` text;
--> statement-breakpoint
ALTER TABLE `tracked` ADD `remind_on_release` integer NOT NULL DEFAULT 0;
