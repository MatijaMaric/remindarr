ALTER TABLE `users` ADD `watchlist_share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_watchlist_share_token_idx` ON `users` (`watchlist_share_token`);
