-- Consolidate duplicate streaming provider IDs directly in the database.
-- TMDB assigns multiple provider_id values to the same service; duplicates:
--   119 (Amazon Prime Video) → 9 (canonical Prime Video)
--   1899 (HBO Max)           → 384 (canonical HBO Max)
--
-- Order: update child tables first, delete parent rows last (FK safe).

UPDATE `offers` SET `provider_id` = 9 WHERE `provider_id` = 119;
--> statement-breakpoint
UPDATE `offers` SET `provider_id` = 384 WHERE `provider_id` = 1899;
--> statement-breakpoint
UPDATE `streaming_alerts` SET `provider_id` = 9 WHERE `provider_id` = 119;
--> statement-breakpoint
UPDATE `streaming_alerts` SET `provider_id` = 384 WHERE `provider_id` = 1899;
--> statement-breakpoint
DELETE FROM `user_subscribed_providers` WHERE `provider_id` = 119 AND `user_id` IN (SELECT `user_id` FROM `user_subscribed_providers` WHERE `provider_id` = 9);
--> statement-breakpoint
DELETE FROM `user_subscribed_providers` WHERE `provider_id` = 1899 AND `user_id` IN (SELECT `user_id` FROM `user_subscribed_providers` WHERE `provider_id` = 384);
--> statement-breakpoint
UPDATE `user_subscribed_providers` SET `provider_id` = 9 WHERE `provider_id` = 119;
--> statement-breakpoint
UPDATE `user_subscribed_providers` SET `provider_id` = 384 WHERE `provider_id` = 1899;
--> statement-breakpoint
DELETE FROM `providers` WHERE `id` IN (119, 1899);
