CREATE TABLE `application_events` (
	`id` text PRIMARY KEY,
	`application_id` text NOT NULL,
	`event_type` text NOT NULL,
	`detail` text NOT NULL,
	`occurred_at` integer NOT NULL,
	CONSTRAINT `fk_application_events_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_applications_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_applications_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `candidate_claim_evidence` (
	`claim_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	CONSTRAINT `fk_candidate_claim_evidence_claim_id_candidate_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `candidate_claims`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_candidate_claim_evidence_evidence_id_evidence_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `candidate_claims` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`state` text NOT NULL,
	`confidence` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_candidate_claims_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY,
	`evaluation_id` text NOT NULL,
	`priority` text NOT NULL,
	`explanation` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_decisions_evaluation_id_evaluations_id_fk` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `evaluation_evidence` (
	`evaluation_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`dimension` text NOT NULL,
	CONSTRAINT `fk_evaluation_evidence_evaluation_id_evaluations_id_fk` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_evaluation_evidence_evidence_id_evidence_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `evaluation_finding_evidence` (
	`finding_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	CONSTRAINT `fk_evaluation_finding_evidence_finding_id_evaluation_findings_id_fk` FOREIGN KEY (`finding_id`) REFERENCES `evaluation_findings`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_evaluation_finding_evidence_evidence_id_evidence_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `evaluation_findings` (
	`id` text PRIMARY KEY,
	`evaluation_id` text NOT NULL,
	`category` text NOT NULL,
	`dimension_key` text NOT NULL,
	`state` text NOT NULL,
	`summary` text NOT NULL,
	`confidence` text,
	CONSTRAINT `fk_evaluation_findings_evaluation_id_evaluations_id_fk` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`eligibility_state` text NOT NULL,
	`fit_level` text NOT NULL,
	`quality_level` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_evaluations_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_evaluations_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY,
	`evidence_type` text NOT NULL,
	`source_reference` text NOT NULL,
	`excerpt` text NOT NULL,
	`state` text DEFAULT 'unreviewed' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunity_snapshot_evidence` (
	`snapshot_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	CONSTRAINT `fk_opportunity_snapshot_evidence_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_opportunity_snapshot_evidence_evidence_id_evidence_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `opportunity_snapshot_sources` (
	`snapshot_id` text NOT NULL,
	`source_observation_id` text NOT NULL,
	CONSTRAINT `fk_opportunity_snapshot_sources_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_opportunity_snapshot_sources_source_observation_id_source_observations_id_fk` FOREIGN KEY (`source_observation_id`) REFERENCES `source_observations`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `opportunity_snapshots` (
	`id` text PRIMARY KEY,
	`opportunity_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`title` text NOT NULL,
	`organization` text NOT NULL,
	`location` text,
	`work_model` text,
	`employment_type` text,
	`compensation` text,
	`content` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_opportunity_snapshots_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `source_listings` (
	`id` text PRIMARY KEY,
	`opportunity_id` text,
	`source_system` text NOT NULL,
	`source_external_id` text NOT NULL,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_source_listings_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `source_observations` (
	`id` text PRIMARY KEY,
	`source_listing_id` text NOT NULL,
	`raw_payload` text NOT NULL,
	`fingerprint` text NOT NULL,
	`observed_at` integer NOT NULL,
	`source_updated_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_source_observations_source_listing_id_source_listings_id_fk` FOREIGN KEY (`source_listing_id`) REFERENCES `source_listings`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_background_tasks` (
	`id` text PRIMARY KEY,
	`task_type` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`idempotency_key` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "background_tasks_state_check" CHECK("state" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "background_tasks_attempts_check" CHECK("attempts" >= 0),
	CONSTRAINT "background_tasks_max_attempts_check" CHECK("max_attempts" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_background_tasks`(`id`, `task_type`, `payload`, `state`, `attempts`, `max_attempts`, `available_at`, `lease_owner`, `lease_expires_at`, `idempotency_key`, `last_error`, `created_at`, `updated_at`) SELECT `id`, `task_type`, `payload`, `state`, `attempts`, `max_attempts`, `available_at`, `lease_owner`, `lease_expires_at`, `idempotency_key`, `last_error`, `created_at`, `updated_at` FROM `background_tasks`;--> statement-breakpoint
DROP TABLE `background_tasks`;--> statement-breakpoint
ALTER TABLE `__new_background_tasks` RENAME TO `background_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `background_tasks_idempotency_key_unique` ON `background_tasks` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `background_tasks_claimable_idx` ON `background_tasks` (`state`,`available_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `background_tasks_expired_lease_idx` ON `background_tasks` (`state`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `app_events_app_time_idx` ON `application_events` (`application_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `applications_candidate_opportunity_idx` ON `applications` (`candidate_id`,`opportunity_id`);--> statement-breakpoint
CREATE INDEX `cce_claim_idx` ON `candidate_claim_evidence` (`claim_id`);--> statement-breakpoint
CREATE INDEX `cce_evidence_idx` ON `candidate_claim_evidence` (`evidence_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cce_unique_idx` ON `candidate_claim_evidence` (`claim_id`,`evidence_id`);--> statement-breakpoint
CREATE INDEX `eval_ev_eval_idx` ON `evaluation_evidence` (`evaluation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `eval_ev_unique_idx` ON `evaluation_evidence` (`evaluation_id`,`evidence_id`,`dimension`);--> statement-breakpoint
CREATE INDEX `efe_finding_idx` ON `evaluation_finding_evidence` (`finding_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `efe_unique_idx` ON `evaluation_finding_evidence` (`finding_id`,`evidence_id`);--> statement-breakpoint
CREATE INDEX `eval_finding_eval_idx` ON `evaluation_findings` (`evaluation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `eval_finding_unique_idx` ON `evaluation_findings` (`evaluation_id`,`category`,`dimension_key`);--> statement-breakpoint
CREATE INDEX `evaluations_candidate_snapshot_idx` ON `evaluations` (`candidate_id`,`snapshot_id`);--> statement-breakpoint
CREATE INDEX `ose_snapshot_idx` ON `opportunity_snapshot_evidence` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `ose_evidence_idx` ON `opportunity_snapshot_evidence` (`evidence_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ose_unique_idx` ON `opportunity_snapshot_evidence` (`snapshot_id`,`evidence_id`);--> statement-breakpoint
CREATE INDEX `oss_snapshot_idx` ON `opportunity_snapshot_sources` (`snapshot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oss_unique_idx` ON `opportunity_snapshot_sources` (`snapshot_id`,`source_observation_id`);--> statement-breakpoint
CREATE INDEX `opportunity_snapshots_opp_time_idx` ON `opportunity_snapshots` (`opportunity_id`,`observed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_listings_system_ext_idx` ON `source_listings` (`source_system`,`source_external_id`);--> statement-breakpoint
CREATE INDEX `source_observations_listing_time_idx` ON `source_observations` (`source_listing_id`,`observed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_observations_listing_fingerprint_idx` ON `source_observations` (`source_listing_id`,`fingerprint`);