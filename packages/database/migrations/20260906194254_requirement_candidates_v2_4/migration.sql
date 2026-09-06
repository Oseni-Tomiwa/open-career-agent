CREATE TABLE `requirement_assistance_runs` (
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
	CONSTRAINT "requirement_assistance_runs_status_check" CHECK("status" in ('SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED')),
	CONSTRAINT "requirement_assistance_runs_unsafe_check" CHECK("unsafe_promotion_attempts" = 0)
);
--> statement-breakpoint
CREATE TABLE `requirement_candidate_sources` (
	`id` text PRIMARY KEY,
	`requirement_candidate_id` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`normalized_fragment_id` text NOT NULL,
	`source_field_path` text,
	`excerpt` text NOT NULL,
	`excerpt_hash` text NOT NULL,
	CONSTRAINT `fk_requirement_candidate_sources_requirement_candidate_id_requirement_candidates_id_fk` FOREIGN KEY (`requirement_candidate_id`) REFERENCES `requirement_candidates`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_requirement_candidate_sources_source_observation_id_source_observations_id_fk` FOREIGN KEY (`source_observation_id`) REFERENCES `source_observations`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_requirement_candidate_sources_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `requirement_candidates` (
	`id` text PRIMARY KEY,
	`requirement_set_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`category` text NOT NULL,
	`normalized_key` text NOT NULL,
	`value_json` text NOT NULL,
	`statement` text NOT NULL,
	`strength` text NOT NULL,
	`polarity` text NOT NULL,
	`assertion_basis` text NOT NULL,
	`evaluation_use` text NOT NULL,
	`actionability_ceiling` text NOT NULL,
	`model_confidence` text NOT NULL,
	`rationale` text NOT NULL,
	`proposer_id` text NOT NULL,
	`model_capability_version` text NOT NULL,
	`instruction_version` text NOT NULL,
	`proposal_schema_version` text NOT NULL,
	`grounding_validator_version` text NOT NULL,
	`validation_status` text NOT NULL,
	`grounding_status` text NOT NULL,
	`rejection_reasons_json` text NOT NULL,
	`proposal_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_requirement_candidates_requirement_set_id_requirement_sets_id_fk` FOREIGN KEY (`requirement_set_id`) REFERENCES `requirement_sets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_requirement_candidates_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "requirement_candidates_actionability_ceiling_check" CHECK("actionability_ceiling" in ('FIT_SIGNAL_SAFE', 'REVIEW_ONLY')),
	CONSTRAINT "requirement_candidates_validation_status_check" CHECK("validation_status" in ('ACCEPTED_FOR_REVIEW', 'DUPLICATE', 'REJECTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_assistance_runs_set_unique` ON `requirement_assistance_runs` (`requirement_set_id`);--> statement-breakpoint
CREATE INDEX `requirement_candidate_sources_candidate_idx` ON `requirement_candidate_sources` (`requirement_candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_candidate_sources_locator_unique` ON `requirement_candidate_sources` (`requirement_candidate_id`,`source_observation_id`,`normalized_fragment_id`,`excerpt_hash`);--> statement-breakpoint
CREATE INDEX `requirement_candidates_set_idx` ON `requirement_candidates` (`requirement_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_candidates_set_hash_unique` ON `requirement_candidates` (`requirement_set_id`,`proposal_hash`);