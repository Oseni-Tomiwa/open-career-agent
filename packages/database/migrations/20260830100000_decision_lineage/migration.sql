ALTER TABLE `evaluations` ADD `eligibility_input_fingerprint` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `supersedes_evaluation_id` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `superseded_at` integer;--> statement-breakpoint
DROP INDEX `evaluations_fit_input_unique`;--> statement-breakpoint
CREATE INDEX `evaluations_current_lineage_idx` ON `evaluations` (`candidate_id`,`snapshot_id`,`superseded_at`);--> statement-breakpoint

CREATE TABLE `__new_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `evaluation_id` text NOT NULL REFERENCES `evaluations`(`id`) ON UPDATE no action ON DELETE restrict,
  `candidate_id` text NOT NULL REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
  `snapshot_id` text NOT NULL REFERENCES `opportunity_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
  `priority` text NOT NULL,
  `action` text,
  `explanation` text NOT NULL,
  `engine_version` text,
  `input_fingerprint` text,
  `eligibility_input_fingerprint` text NOT NULL,
  `fit_input_fingerprint` text NOT NULL,
  `quality_input_fingerprint` text NOT NULL,
  `reason_codes` text,
  `evaluated_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_decisions` (`id`,`evaluation_id`,`candidate_id`,`snapshot_id`,`priority`,`action`,`explanation`,`engine_version`,`input_fingerprint`,`eligibility_input_fingerprint`,`fit_input_fingerprint`,`quality_input_fingerprint`,`reason_codes`,`evaluated_at`,`created_at`)
SELECT d.`id`, d.`evaluation_id`, e.`candidate_id`, e.`snapshot_id`, CASE WHEN d.`priority` = 'ineligible' THEN 'blocked' ELSE d.`priority` END, d.`action`, d.`explanation`, d.`engine_version`, d.`input_fingerprint`, COALESCE(e.`eligibility_input_fingerprint`, 'legacy:' || e.`id`), COALESCE(e.`fit_input_fingerprint`, 'legacy:' || e.`id`), COALESCE(e.`quality_input_fingerprint`, 'legacy:' || e.`id`), d.`reason_codes`, d.`evaluated_at`, d.`created_at`
FROM `decisions` d INNER JOIN `evaluations` e ON d.`evaluation_id` = e.`id`;--> statement-breakpoint
DROP TABLE `decisions`;--> statement-breakpoint
ALTER TABLE `__new_decisions` RENAME TO `decisions`;--> statement-breakpoint
CREATE INDEX `decisions_eval_idx` ON `decisions` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `decisions_input_idx` ON `decisions` (`candidate_id`,`snapshot_id`,`engine_version`,`input_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `decisions_semantic_input_unique` ON `decisions` (`candidate_id`,`snapshot_id`,`engine_version`,`input_fingerprint`);--> statement-breakpoint
CREATE TABLE `decision_reasons` (
  `id` text PRIMARY KEY NOT NULL,
  `decision_id` text NOT NULL REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE cascade,
  `reason_code` text NOT NULL,
  `finding_id` text NOT NULL REFERENCES `evaluation_findings`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX `decision_reason_decision_idx` ON `decision_reasons` (`decision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `decision_reason_unique` ON `decision_reasons` (`decision_id`,`reason_code`,`finding_id`);
