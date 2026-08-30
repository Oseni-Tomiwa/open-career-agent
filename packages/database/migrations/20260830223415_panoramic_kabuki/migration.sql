CREATE TABLE `search_targets` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`target_roles_json` text DEFAULT '[]' NOT NULL,
	`skills_json` text DEFAULT '[]' NOT NULL,
	`locations_json` text DEFAULT '[]' NOT NULL,
	`location_is_hard_filter` integer DEFAULT false NOT NULL,
	`work_models_json` text DEFAULT '[]' NOT NULL,
	`work_model_is_hard_filter` integer DEFAULT false NOT NULL,
	`seniority_levels_json` text DEFAULT '[]' NOT NULL,
	`seniority_is_hard_filter` integer DEFAULT false NOT NULL,
	`employment_types_json` text DEFAULT '[]' NOT NULL,
	`employment_type_is_hard_filter` integer DEFAULT false NOT NULL,
	`requires_sponsorship` integer,
	`willing_to_relocate` integer,
	`min_salary` integer,
	`currency` text,
	`freshness_days` integer,
	`required_terms_json` text DEFAULT '[]' NOT NULL,
	`excluded_terms_json` text DEFAULT '[]' NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_search_targets_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `discovery_runs` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`search_target_id` text NOT NULL,
	`source_system` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`rejected_by_reason_json` text,
	`error_summary` text,
	CONSTRAINT `fk_discovery_runs_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_runs_search_target_id_search_targets_id_fk` FOREIGN KEY (`search_target_id`) REFERENCES `search_targets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `discovery_matches` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`search_target_id` text NOT NULL,
	`discovery_run_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`matched_at` integer NOT NULL,
	`match_reasons_json` text DEFAULT '[]' NOT NULL,
	`retained_unresolved_json` text DEFAULT '[]' NOT NULL,
	CONSTRAINT `fk_discovery_matches_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_matches_search_target_id_search_targets_id_fk` FOREIGN KEY (`search_target_id`) REFERENCES `search_targets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_matches_discovery_run_id_discovery_runs_id_fk` FOREIGN KEY (`discovery_run_id`) REFERENCES `discovery_runs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_matches_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_matches_source_listing_id_source_listings_id_fk` FOREIGN KEY (`source_listing_id`) REFERENCES `source_listings`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_matches_cand_target_opp_idx` ON `discovery_matches` (`candidate_id`,`search_target_id`,`opportunity_id`);--> statement-breakpoint
CREATE INDEX `discovery_matches_candidate_idx` ON `discovery_matches` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `discovery_runs_target_idx` ON `discovery_runs` (`search_target_id`);--> statement-breakpoint
CREATE INDEX `discovery_runs_candidate_idx` ON `discovery_runs` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `search_targets_candidate_idx` ON `search_targets` (`candidate_id`);