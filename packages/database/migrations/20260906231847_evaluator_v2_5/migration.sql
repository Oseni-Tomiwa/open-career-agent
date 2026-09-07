ALTER TABLE `evaluation_findings` ADD `canonical_requirement_id` text REFERENCES canonical_requirements(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `requirement_input_mode` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `fit_assessment_status` text;--> statement-breakpoint
CREATE TRIGGER `evaluations_requirement_input_mode_insert_check`
BEFORE INSERT ON `evaluations`
WHEN NEW.`requirement_input_mode` IS NOT NULL
  AND NEW.`requirement_input_mode` NOT IN ('CANONICAL', 'FALLBACK_TRANSIENT_V1')
BEGIN
  SELECT RAISE(ABORT, 'invalid requirement_input_mode');
END;--> statement-breakpoint
CREATE TRIGGER `evaluations_requirement_input_mode_update_check`
BEFORE UPDATE OF `requirement_input_mode` ON `evaluations`
WHEN NEW.`requirement_input_mode` IS NOT NULL
  AND NEW.`requirement_input_mode` NOT IN ('CANONICAL', 'FALLBACK_TRANSIENT_V1')
BEGIN
  SELECT RAISE(ABORT, 'invalid requirement_input_mode');
END;--> statement-breakpoint
CREATE TRIGGER `evaluations_fit_assessment_insert_check`
BEFORE INSERT ON `evaluations`
WHEN NEW.`fit_assessment_status` IS NOT NULL
  AND NOT (
    (NEW.`fit_assessment_status` = 'ASSESSED' AND NEW.`fit_level` IS NOT NULL)
    OR (NEW.`fit_assessment_status` IN ('INSUFFICIENT_LISTING_REQUIREMENTS', 'INSUFFICIENT_CANDIDATE_EVIDENCE') AND NEW.`fit_level` IS NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid fit assessment status/level combination');
END;--> statement-breakpoint
CREATE TRIGGER `evaluations_fit_assessment_update_check`
BEFORE UPDATE OF `fit_assessment_status`, `fit_level` ON `evaluations`
WHEN NEW.`fit_assessment_status` IS NOT NULL
  AND NOT (
    (NEW.`fit_assessment_status` = 'ASSESSED' AND NEW.`fit_level` IS NOT NULL)
    OR (NEW.`fit_assessment_status` IN ('INSUFFICIENT_LISTING_REQUIREMENTS', 'INSUFFICIENT_CANDIDATE_EVIDENCE') AND NEW.`fit_level` IS NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid fit assessment status/level combination');
END;
