CREATE TABLE `canonical_requirements` (
	`id` text PRIMARY KEY,
	`requirement_set_id` text NOT NULL,
	`category` text NOT NULL,
	`normalized_key` text NOT NULL,
	`value_json` text NOT NULL,
	`statement` text NOT NULL,
	`strength` text NOT NULL,
	`polarity` text NOT NULL,
	`assertion_basis` text NOT NULL,
	`evaluation_use` text NOT NULL,
	`actionability` text NOT NULL,
	`extraction_confidence` text NOT NULL,
	`extractor_id` text NOT NULL,
	`extractor_version` text NOT NULL,
	`canonical_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_canonical_requirements_requirement_set_id_requirement_sets_id_fk` FOREIGN KEY (`requirement_set_id`) REFERENCES `requirement_sets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "canonical_requirements_strength_check" CHECK("strength" in ('REQUIRED', 'PREFERRED', 'CONTEXTUAL')),
	CONSTRAINT "canonical_requirements_hard_safety_check" CHECK("actionability" <> 'HARD_CONSTRAINT_SAFE' OR ("strength" = 'REQUIRED' AND "evaluation_use" = 'ELIGIBILITY' AND "assertion_basis" in ('EXPLICIT_STRUCTURED', 'EXPLICIT_TEXT') AND "extraction_confidence" = 'HIGH'))
);
--> statement-breakpoint
CREATE TABLE `requirement_provenance` (
	`id` text PRIMARY KEY,
	`requirement_id` text NOT NULL,
	`source_observation_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`source_field_path` text,
	`normalized_section` text,
	`start_offset` integer,
	`end_offset` integer,
	`excerpt` text NOT NULL,
	`excerpt_hash` text NOT NULL,
	`locator_version` text NOT NULL,
	`extractor_id` text NOT NULL,
	`extractor_version` text NOT NULL,
	CONSTRAINT `fk_requirement_provenance_requirement_id_canonical_requirements_id_fk` FOREIGN KEY (`requirement_id`) REFERENCES `canonical_requirements`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_requirement_provenance_source_observation_id_source_observations_id_fk` FOREIGN KEY (`source_observation_id`) REFERENCES `source_observations`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_requirement_provenance_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "requirement_provenance_offsets_check" CHECK(("start_offset" is null AND "end_offset" is null) OR ("start_offset" >= 0 AND "end_offset" >= "start_offset"))
);
--> statement-breakpoint
CREATE TABLE `requirement_sets` (
	`id` text PRIMARY KEY,
	`snapshot_id` text NOT NULL,
	`model_version` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`extractor_pipeline_version` text NOT NULL,
	`deterministic_extractor_version` text NOT NULL,
	`status` text NOT NULL,
	`deterministic_status` text NOT NULL,
	`assisted_status` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_requirement_sets_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "requirement_sets_status_check" CHECK("status" in ('COMPLETE', 'PARTIAL', 'FAILED')),
	CONSTRAINT "requirement_sets_deterministic_status_check" CHECK("deterministic_status" in ('SUCCEEDED', 'FAILED')),
	CONSTRAINT "requirement_sets_assisted_status_check" CHECK("assisted_status" in ('NOT_REQUESTED', 'SUCCEEDED', 'UNAVAILABLE', 'REJECTED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE `evaluations` ADD `requirement_set_id` text REFERENCES requirement_sets(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `requirement_input_fingerprint` text;--> statement-breakpoint
CREATE INDEX `canonical_requirements_set_idx` ON `canonical_requirements` (`requirement_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_requirements_set_hash_unique` ON `canonical_requirements` (`requirement_set_id`,`canonical_hash`);--> statement-breakpoint
CREATE INDEX `evaluations_requirement_set_idx` ON `evaluations` (`requirement_set_id`);--> statement-breakpoint
CREATE INDEX `requirement_provenance_requirement_idx` ON `requirement_provenance` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `requirement_provenance_observation_idx` ON `requirement_provenance` (`source_observation_id`);--> statement-breakpoint
CREATE INDEX `requirement_provenance_snapshot_idx` ON `requirement_provenance` (`snapshot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_provenance_locator_unique` ON `requirement_provenance` (`requirement_id`,`source_observation_id`,`excerpt_hash`,`locator_version`);--> statement-breakpoint
CREATE INDEX `requirement_sets_snapshot_idx` ON `requirement_sets` (`snapshot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_sets_compatible_input_unique` ON `requirement_sets` (`snapshot_id`,`extractor_pipeline_version`,`input_fingerprint`);