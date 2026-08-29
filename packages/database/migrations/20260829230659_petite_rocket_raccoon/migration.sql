PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_evaluations` (
	`id` text PRIMARY KEY,
	`candidate_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`eligibility_state` text NOT NULL,
	`fit_level` text,
	`quality_level` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_evaluations_candidate_id_candidates_id_fk` FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_evaluations_snapshot_id_opportunity_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `opportunity_snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_evaluations`(`id`, `candidate_id`, `snapshot_id`, `eligibility_state`, `fit_level`, `quality_level`, `created_at`) SELECT `id`, `candidate_id`, `snapshot_id`, `eligibility_state`, `fit_level`, `quality_level`, `created_at` FROM `evaluations`;--> statement-breakpoint
DROP TABLE `evaluations`;--> statement-breakpoint
ALTER TABLE `__new_evaluations` RENAME TO `evaluations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `evaluations_candidate_snapshot_idx` ON `evaluations` (`candidate_id`,`snapshot_id`);