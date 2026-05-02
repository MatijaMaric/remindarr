-- Backfill: set user_status='completed' for tracked movies that already have a watched_titles row.
-- Only updates rows where user_status is NULL (preserves explicit dropped/on_hold/plan_to_watch).
UPDATE `tracked`
  SET `user_status` = 'completed'
  WHERE `user_status` IS NULL
    AND EXISTS (SELECT 1 FROM `watched_titles` wt
                WHERE wt.`title_id` = `tracked`.`title_id`
                  AND wt.`user_id`  = `tracked`.`user_id`)
    AND EXISTS (SELECT 1 FROM `titles` t
                WHERE t.`id` = `tracked`.`title_id` AND t.`object_type` = 'MOVIE');
--> statement-breakpoint
-- Backfill reverse: insert watched_titles rows for tracked movies with user_status='completed' that
-- have no corresponding watched_titles entry (e.g. set via StatusPicker before this fix).
INSERT OR IGNORE INTO `watched_titles` (`title_id`, `user_id`)
  SELECT tr.`title_id`, tr.`user_id`
    FROM `tracked` tr
    INNER JOIN `titles` t ON t.`id` = tr.`title_id`
   WHERE tr.`user_status` = 'completed'
     AND t.`object_type` = 'MOVIE';
