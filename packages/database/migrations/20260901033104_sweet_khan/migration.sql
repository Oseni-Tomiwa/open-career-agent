CREATE TABLE `career_profile_reevaluations` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`task_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_career_profile_reevaluations_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `subject_key` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `candidate_claims` SET `subject_key` = 'legacy:' || `id`;--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `lifecycle_state` text DEFAULT 'CURRENT' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `predecessor_claim_id` text;--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `succession_type` text;--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `succession_note` text;--> statement-breakpoint
ALTER TABLE `candidate_claims` ADD `ended_at` integer;--> statement-breakpoint
CREATE INDEX `candidate_claims_candidate_lifecycle_idx` ON `candidate_claims` (`candidate_id`,`lifecycle_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_claims_current_subject_unique` ON `candidate_claims` (`candidate_id`,`subject_key`) WHERE "candidate_claims"."lifecycle_state" = 'CURRENT';--> statement-breakpoint
CREATE INDEX `career_profile_reevaluations_candidate_idx` ON `career_profile_reevaluations` (`candidate_id`,`created_at`);
