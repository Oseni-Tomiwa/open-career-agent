ALTER TABLE `evaluation_findings` ADD `modality` text;--> statement-breakpoint
ALTER TABLE `evaluation_findings` ADD `requirement_text` text;--> statement-breakpoint
ALTER TABLE `evaluation_findings` ADD `explanation` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `eligibility_engine_version` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `fit_engine_version` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `fit_input_fingerprint` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `fit_summary` text;--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_fit_input_unique` ON `evaluations` (`candidate_id`,`snapshot_id`,`fit_engine_version`,`fit_input_fingerprint`);