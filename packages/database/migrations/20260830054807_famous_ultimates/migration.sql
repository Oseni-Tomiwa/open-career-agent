ALTER TABLE `decisions` ADD `action` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `engine_version` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `input_fingerprint` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `reason_codes` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `evaluated_at` integer;--> statement-breakpoint
CREATE INDEX `decisions_eval_idx` ON `decisions` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `decisions_input_idx` ON `decisions` (`evaluation_id`,`engine_version`,`input_fingerprint`);