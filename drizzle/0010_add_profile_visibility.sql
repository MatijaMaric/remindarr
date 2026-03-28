ALTER TABLE `users` ADD `profile_public` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tracked` ADD `public` integer NOT NULL DEFAULT 1;
