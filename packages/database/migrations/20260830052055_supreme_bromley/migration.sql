ALTER TABLE `evaluations` ADD `quality_engine_version` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `quality_input_fingerprint` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `quality_summary` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `quality_evaluated_at` integer;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `quality_freshness_bucket` text;