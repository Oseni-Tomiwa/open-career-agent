PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_requirement_assistance_runs` (
	`id` text PRIMARY KEY,
	`requirement_set_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`assisted_pipeline_version` text NOT NULL,
	`selection_version` text NOT NULL,
	`proposal_schema_version` text NOT NULL,
	`instruction_version` text NOT NULL,
	`grounding_validator_version` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_capability_version` text NOT NULL,
	`status` text NOT NULL,
	`attempted` integer NOT NULL,
	`selected_fragment_count` integer NOT NULL,
	`selected_character_count` integer NOT NULL,
	`proposal_count` integer NOT NULL,
	`grounded_count` integer NOT NULL,
	`rejected_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`consequential_count` integer NOT NULL,
	`unsafe_promotion_attempts` integer NOT NULL,
	`rejection_reason_counts_json` text NOT NULL,
	`safe_reason` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_requirement_assistance_runs_requirement_set_id_requirement_sets_id_fk` FOREIGN KEY (`requirement_set_id`) REFERENCES `requirement_sets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "requirement_assistance_runs_status_check" CHECK("status" in ('SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED'))
);
--> statement-breakpoint
INSERT INTO `__new_requirement_assistance_runs`(`id`, `requirement_set_id`, `request_fingerprint`, `assisted_pipeline_version`, `selection_version`, `proposal_schema_version`, `instruction_version`, `grounding_validator_version`, `provider_id`, `provider_capability_version`, `status`, `attempted`, `selected_fragment_count`, `selected_character_count`, `proposal_count`, `grounded_count`, `rejected_count`, `duplicate_count`, `consequential_count`, `unsafe_promotion_attempts`, `rejection_reason_counts_json`, `safe_reason`, `created_at`) SELECT `id`, `requirement_set_id`, `request_fingerprint`, `assisted_pipeline_version`, `selection_version`, `proposal_schema_version`, `instruction_version`, `grounding_validator_version`, `provider_id`, `provider_capability_version`, `status`, `attempted`, `selected_fragment_count`, `selected_character_count`, `proposal_count`, `grounded_count`, `rejected_count`, `duplicate_count`, `consequential_count`, `unsafe_promotion_attempts`, `rejection_reason_counts_json`, `safe_reason`, `created_at` FROM `requirement_assistance_runs`;--> statement-breakpoint
DROP TABLE `requirement_assistance_runs`;--> statement-breakpoint
ALTER TABLE `__new_requirement_assistance_runs` RENAME TO `requirement_assistance_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_assistance_runs_set_unique` ON `requirement_assistance_runs` (`requirement_set_id`);